import {env} from 'cloudflare:test';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {reset,fixture,document} from '../authority/fixture';
import {canary} from '../data/fixture';
import {start,deferred,bindings} from '../run-attempts/fixture';
import {answer,providerResponse} from '../inquiry/fixture';
import {latchR2} from '../portability-jobs/helpers';
import {consumeIntelligenceJob} from '../../../src/core/features/runs/worker';
import {stagePortabilityJob,runPortabilityJob,getPortabilityJob} from '../../../src/core/features/portability/jobs';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';
import type {FeatureContext} from '../../../src/core/app/feature-context';
beforeEach(reset);afterEach(()=>vi.unstubAllGlobals());
async function erase(ctx:FeatureContext,pageId:string){const revisionId=await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(pageId).first<string>('revision_id');await archivePage(ctx,pageId,{operationKey:'composed-trash',expectedRevisionId:revisionId!,action:'trash'});await permanentDeletePage(ctx,pageId,{operationKey:'composed-erase',confirmedPageIds:[pageId]});}

test('permanent erasure fences late generation and preserves honest cost uncertainty without restoring stage metadata',async()=>{
 const {f,run,job}=await start(),d=deferred(),pending=consumeIntelligenceJob(bindings(),job);await d.ready;
 let erased:unknown;
 try{
  await erase(f.context(),f.page.pageId);
  erased=await env.DB.prepare('SELECT cost_micros,tokens,uncertain_cost_micros FROM intelligence_runs WHERE id=?').bind(run.value.id).first();
  expect((erased as {cost_micros:number}).cost_micros).toBe(0);expect((erased as {uncertain_cost_micros:number}).uncertain_cost_micros).toBeGreaterThan(0);
  expect(await env.DB.prepare('SELECT result_json FROM intelligence_stages WHERE run_id=?').bind(run.value.id).first()).toEqual({result_json:null});
  expect(await env.DB.prepare("SELECT count(*) n FROM intelligence_interruptions WHERE run_id=? AND state='reserved'").bind(run.value.id).first()).toEqual({n:0});
 }finally{d.release(providerResponse({...answer,statements:[{...answer.statements[0],text:canary}]}));await pending;}
 expect(await env.DB.prepare('SELECT cost_micros,tokens,uncertain_cost_micros FROM intelligence_runs WHERE id=?').bind(run.value.id).first()).toEqual(erased);
 expect(await env.DB.prepare('SELECT status,output_json,lease_id FROM intelligence_runs WHERE id=?').bind(run.value.id).first()).toEqual({status:'cancelled',output_json:null,lease_id:null});
 expect(await env.DB.prepare('SELECT result_json FROM intelligence_stages WHERE run_id=?').bind(run.value.id).first()).toEqual({result_json:null});
 expect((await env.DB.prepare('SELECT released_at FROM intelligence_budgets WHERE run_id=?').bind(run.value.id).first())?.released_at).toBeTruthy();
});

test('permanent page erasure invalidates operational export jobs and deletes a late R2 artifact',async()=>{
 const f=await fixture(),page=await document(f,canary),ctx=f.context(),job=await stagePortabilityJob(ctx,'export','composed-export'),latch=latchR2(ctx,'federation/exports/'),pending=runPortabilityJob(latch.ctx,job.id);await latch.started;
 try{await erase(ctx,page.id);const receipt=await getPortabilityJob(ctx,job.id);expect(receipt.state).toBe('failed');expect(receipt.report.code).toBe('INVALIDATED');expect(receipt.counts).toEqual({});}finally{latch.release();}
 expect((await pending).state).toBe('failed');expect(await env.FILES.head(`federation/exports/${job.id}/workspace.zip`)).toBeNull();
 const retained=await env.DB.prepare('SELECT * FROM portability_jobs WHERE id=?').bind(job.id).first();expect(JSON.stringify(retained)).not.toContain(canary);expect(retained?.lease_id).toBeNull();
});
