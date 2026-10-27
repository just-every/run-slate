import {env} from 'cloudflare:test';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {reset} from '../authority/fixture';
import {sessionFor} from '../../e2e/setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import {durableState,effectFixture,restoredFixture} from './fixture';
import {dispatchEffect,prepareEffect,reconcileEffect,requireEffect} from '../../../src/core/features/effects/service';
import {previewNativeEffect,authorizeNativeEffect} from '../../../src/core/features/effects/native-proposal';
import {revokeGrant} from '../../../src/core/features/effects/grants';
import {requireRun,reauthorizeRun} from '../../../src/core/features/runs/repository';
import {controlRun} from '../../../src/core/features/runs/service';

beforeEach(reset);
afterEach(()=>vi.unstubAllGlobals());

test("FLAG-004 PORT-005 EFFECT-001 — restored authority fences replay and reconciliation even after diagnostic clearing while preserving exact history",async()=>{
 // Independent fixtures exercise the same behaviour through both paths.
 for(const scenario of [async()=>{
 const f=await restoredFixture();
 const run=await requireRun(f.context(),f.runId),effect=await requireEffect(f.context(),f.effectId);
 expect(run).toMatchObject({status:'paused',failure_reason:'RESTORED_AUTHORITY_REQUIRED'});
 expect(JSON.parse(run.input_json).recoveryPausedAt).toBeTruthy();
 expect(effect).toEqual(f.confirmed);
 expect(await env.DB.prepare('SELECT revoked_at FROM intelligence_grants WHERE id=?').bind(f.input.grantId).first<string>('revoked_at')).toBeTruthy();
 expect(await env.DB.prepare('SELECT credential_ciphertext,state FROM federation_connections WHERE id=?').bind(f.input.connectionId).first()).toEqual({credential_ciphertext:null,state:'needs-attention'});
 const before=await durableState(),calls=f.calls();
 const cookie=await sessionFor(f.owner),api=createApi();
 const response=await api.request('http://localhost:8787/api/effects/'+f.effectId+'/dispatch',{method:'POST',headers:{Cookie:cookie,Origin:'http://localhost:8787','Content-Type':'application/json'},body:'{}'},{...env,SLATE_PROFILE:'flagship',CONNECTOR_CREDENTIALS_KEY:f.ctx.sourceSecret});
 expect(response.status).toBe(403);
 expect(await response.json()).toMatchObject({code:'RESTORED_AUTHORITY_REQUIRED'});
 await expect(dispatchEffect(f.context(),f.effectId)).rejects.toMatchObject({status:403,code:'RESTORED_AUTHORITY_REQUIRED'});
 await expect(prepareEffect(f.context(),f.input)).rejects.toMatchObject({status:403,code:'RESTORED_AUTHORITY_REQUIRED'});
 await expect(previewNativeEffect(f.context(),f.input)).rejects.toMatchObject({status:403,code:'RESTORED_AUTHORITY_REQUIRED'});
 await expect(authorizeNativeEffect(f.context(),{...f.input,expiresAt:'2099-01-01T00:00:00Z'})).rejects.toMatchObject({status:403,code:'RESTORED_AUTHORITY_REQUIRED'});
 expect(await durableState()).toEqual(before);
 expect(f.calls()).toBe(calls);expect(f.sends()).toBe(1);
 expect((await requireEffect(f.context(),f.effectId)).receipt_json).toBe(f.confirmed.receipt_json);
},
async()=>{
 const f=await restoredFixture();
 await env.DB.prepare('UPDATE intelligence_runs SET failure_reason=NULL WHERE id=?').bind(f.runId).run();
 // Model a restored in-flight write: reconciliation must not reacquire authority.
 await env.DB.prepare("UPDATE intelligence_effects SET state='uncertain' WHERE id=?").bind(f.effectId).run();
 const before=await durableState(),calls=f.calls();
 for(const action of [()=>dispatchEffect(f.context(),f.effectId),()=>reconcileEffect(f.context(),f.effectId),()=>prepareEffect(f.context(),{...f.input,operationKey:crypto.randomUUID()})]){
  await expect(action()).rejects.toMatchObject({status:403,code:'RESTORED_AUTHORITY_REQUIRED'});
 }
 expect(await durableState()).toEqual(before);expect(f.calls()).toBe(calls);
 // General run conflict semantics are deliberately distinct from effect denial.
 const run=await requireRun(f.context(),f.runId);
 await expect(reauthorizeRun(f.context(),run)).rejects.toMatchObject({status:409,code:'RESTORED_AUTHORITY_REQUIRED'});
 await expect(controlRun(f.context(),{id:f.runId,operationKey:crypto.randomUUID(),expectedRevisionId:run.revision_id,action:'resume'})).rejects.toMatchObject({status:409,code:'RESTORED_AUTHORITY_REQUIRED'});
 expect(await durableState()).toEqual(before);
}]){await reset();await scenario();}
});



test("EFFECT-001 \u2014 current grants dispatch once with receipt replay while revoked grants deny without mutations", async () => {
  await scenario("EFFECT-001 \u2014 a normal current grant permits one dispatch and receipt replay sends nothing", async () => {
 const f=await effectFixture();
 expect((await dispatchEffect(f.ctx,f.effectId)).state).toBe('confirmed');
 const before=await durableState();
 expect((await dispatchEffect(f.ctx,f.effectId)).state).toBe('confirmed');
 expect(f.sends()).toBe(1);expect(await durableState()).toEqual(before);

  });
  await reset();
  await scenario("EFFECT-001 \u2014 revoked grants still deny ordinary non-restored effects without mutations", async () => {
 const f=await effectFixture();
 await revokeGrant(f.ctx,{id:f.input.grantId,operationKey:crypto.randomUUID()});
 const before=await durableState();
 await expect(dispatchEffect({...f.context(),sourceSecret:f.ctx.sourceSecret},f.effectId)).rejects.toMatchObject({status:403,code:'GRANT_REQUIRED'});
 expect(await durableState()).toEqual(before);expect(f.sends()).toBe(0);

  });
});



test('PORT-005 — missing and revoked actors are rejected before restored history or effect authority is disclosed',async()=>{
 let firstCase=true;
 for(const mode of ['missing','revoked'] as const){
 if(!firstCase)await reset();
 firstCase=false;
 try {

 const f=await restoredFixture();
 const actor=mode==='missing'?crypto.randomUUID():f.owner;
 if(mode==='revoked')await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(actor).run();
 const before=await durableState(),calls=f.calls();
 await expect(dispatchEffect(f.context(actor),f.effectId)).rejects.toMatchObject({status:401,code:'UNAUTHENTICATED'});
 await expect(requireEffect(f.context(actor),f.effectId)).rejects.toMatchObject({status:401,code:'UNAUTHENTICATED'});
 expect(await durableState()).toEqual(before);expect(f.calls()).toBe(calls);
 } finally { vi.unstubAllGlobals(); }
 }
});

test('FLAG-004 EFFECT-001 — a live grant cannot override either durable-marker or legacy-reason restore fence',async()=>{
 let firstCase=true;
 for(const fence of ['durable-marker','legacy-reason'] as const){
 if(!firstCase)await reset();
 firstCase=false;
 try {

 const f=await effectFixture();
 if(fence==='durable-marker')await env.DB.prepare("UPDATE intelligence_runs SET input_json=json_set(input_json,'$.recoveryPausedAt',?) WHERE id=?").bind(f.ctx.now,f.runId).run();
 else await env.DB.prepare("UPDATE intelligence_runs SET failure_reason='RESTORED_AUTHORITY_REQUIRED' WHERE id=?").bind(f.runId).run();
 const before=await durableState(),calls=f.calls();
 await expect(dispatchEffect(f.ctx,f.effectId)).rejects.toMatchObject({status:403,code:'RESTORED_AUTHORITY_REQUIRED'});
 expect(await durableState()).toEqual(before);expect(f.calls()).toBe(calls);expect(f.sends()).toBe(0);
 } finally { vi.unstubAllGlobals(); }
 }
});

test('AI-006 — non-restored paused, cancelled and completed runs retain the existing stopped-run conflict',async()=>{
 let firstCase=true;
 for(const status of ['paused','cancelled','completed'] as const){
 if(!firstCase)await reset();
 firstCase=false;
 try {

 const f=await effectFixture();
 await env.DB.prepare('UPDATE intelligence_runs SET status=? WHERE id=?').bind(status,f.runId).run();
 const before=await durableState(),calls=f.calls();
 await expect(dispatchEffect(f.ctx,f.effectId)).rejects.toMatchObject({status:409,code:'RUN_STOPPED'});
 expect(await durableState()).toEqual(before);expect(f.calls()).toBe(calls);expect(f.sends()).toBe(0);
 } finally { vi.unstubAllGlobals(); }
 }
});

// Keep each clause point visible in the failure while sharing one family registration.
async function scenario(name: string, run: () => Promise<void>) {
  try { await run(); }
  catch (cause) { throw new Error(`Scenario ${name} failed`, { cause }); }
}
