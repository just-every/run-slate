import {test,expect,afterEach,vi} from 'vitest';
import {env} from 'cloudflare:test';
import {fixture,answer,transport,binding} from '../../flagship/release-clauses/inquiry/support';
import {reset,fixture as targetFixture} from '../authority/fixture';
import {askInquiry,materializeInquiry} from '../../../src/core/features/inquiries/planner';
import {inquiryView} from '../../../src/core/features/inquiries/service';
import {stopInquiry} from '../../../src/core/features/inquiries/control';
import {consumeIntelligenceJob} from '../../../src/core/features/runs/worker';
import {requireRun} from '../../../src/core/features/runs/repository';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';
import {decodeArchive} from '../../../src/core/features/portability/archive';

afterEach(()=>vi.unstubAllGlobals());
async function archive(ctx:ReturnType<Awaited<ReturnType<typeof fixture>>['context']>){
  const result=await exportWorkspace(ctx);
  const key=await ctx.db.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(result.id).first<string>('archive_key');
  return new Uint8Array(await(await ctx.files.get(key!))!.arrayBuffer());
}

test('Unavailable branch admission survives stop, export, fresh restore and re-export without inventing a run',async()=>{
  await reset();
  const f=await fixture();
  // The inquiry fixture's text-only evidence is intentionally not a native block.
  // Preserve its text in a valid native revision for this full archive journey.
  const body=[{id:crypto.randomUUID(),pageId:f.page.pageId,parentBlockId:null,blockType:'paragraph',treePosition:'a',revisionId:f.page.workingRevisionId,content:{text:[{text:'Security review complete; support handoff open.'}]}}];
  await env.DB.prepare('UPDATE page_revisions SET body_json=? WHERE id=?').bind(JSON.stringify(body),f.page.workingRevisionId).run();
  await env.DB.prepare('UPDATE members SET is_setup_owner=1 WHERE id=?').bind(f.owner).run();
  await env.DB.prepare('UPDATE workspaces SET ai_monthly_budget_micros=220000 WHERE id=?').bind(f.workspaceId).run();
  const parent=await askInquiry(f.context(),{...f.ask,audience:[f.owner]},{apiKey:'test-only'});
  const calls=transport({...answer,researchPlan:{hypotheses:[
    {statement:'Fields differ',disconfirmation:'Original fields match',investigationQuestion:'Inspect fields'},
    {statement:'Handoff differs',disconfirmation:'Original handoff matches',investigationQuestion:'Inspect handoff'},
    {statement:'Population differs',disconfirmation:'Original population matches',investigationQuestion:'Inspect population'},
  ],interimFinding:'Original observations are needed.',analyses:[],trialProposalJson:null}});
  await consumeIntelligenceJob(binding(),{kind:'intelligence.run',workspaceId:f.workspaceId,runId:parent.value.id});
  const completed=await requireRun(f.context(),parent.value.id);
  expect(completed.status).toBe('completed');expect(calls()).toBe(1);
  const inquiryId=JSON.parse(completed.output_json!).inquiryId;
  let view=await inquiryView(f.context(),inquiryId);
  const unavailable=view.hypotheses.filter(h=>h.state==='unavailable');
  expect(unavailable).toHaveLength(1);
  expect(unavailable[0]).toMatchObject({run_id:null,status:'open',reason:'REVISION_CONFLICT',parent_run_id:parent.value.id});
  expect(Number.isFinite(Date.parse(String(unavailable[0]!.attempted_at)))).toBe(true);
  expect(view.hypotheses.filter(h=>h.state==='admitted')).toHaveLength(2);
  const stopped=await stopInquiry(f.context(),inquiryId,{operationKey:'stop-before-portability',expectedRevisionId:view.revisionId,reason:'Keep the bounded findings'});
  const countBefore=await env.DB.prepare('SELECT count(*) n FROM intelligence_runs').first<number>('n');
  await materializeInquiry(f.context(),parent.value.id,{apiKey:'test-only'});
  view=await inquiryView(f.context(),inquiryId);
  expect(view.revisionId).toBe(stopped.value.revisionId);
  expect(view.hypotheses.find(h=>h.id===unavailable[0]!.id)).toEqual(unavailable[0]);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_runs').first<number>('n')).toBe(countBefore);
  const ownerEmail=await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(f.owner).first<string>('email');
  const bytes=await archive(f.context()),before=(await decodeArchive(bytes)).manifest.tables.intelligence_hypotheses!;
  await reset();const target=await targetFixture({withReader:false});
  await env.DB.prepare('UPDATE members SET email=? WHERE id=?').bind(ownerEmail,target.owner).run();
  await restoreWorkspace(target.context(),bytes);
  const restored=await inquiryView(f.context(),inquiryId);
  expect(restored.hypotheses).toEqual(view.hypotheses);
  expect(restored.interimFinding).toMatchObject({stopped:true});
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  expect((await decodeArchive(await archive(f.context()))).manifest.tables.intelligence_hypotheses).toEqual(before);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_effects').first<number>('n')).toBe(0);
  expect(calls()).toBe(1);
});
