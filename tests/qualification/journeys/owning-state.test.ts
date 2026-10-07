import {test,expect,vi,afterEach} from 'vitest';
import {env} from 'cloudflare:test';
import {owningFixture} from './owning-state-fixture';
import {createGuidedTask} from '../../../src/core/features/skills/guided';
import {scheduleGuidedTasks} from '../../../src/core/features/skills/guided-scheduler';
import type {AppBindings} from '../../../src/core/app/types';
afterEach(()=>vi.unstubAllGlobals());
test('prose-only legacy native evidence stays readable but cannot confirm automatic state',async()=>{const f=await owningFixture();f.control.typed=false;await expect(f.verify()).rejects.toMatchObject({code:'OWNING_STATE_UNAVAILABLE'});expect((await f.state())!.state).toBe('pending');});
test('exact mismatch, missing typed state, malformed provider, stale/future timestamps and wrong canonical origin remain pending',async()=>{
 const f=await owningFixture();f.control.state='cancelled';await expect(f.verify()).rejects.toMatchObject({code:'OWNING_STATE_UNCONFIRMED'});f.control.state='open';
 for(const alter of [(v:any)=>{delete v.recordState;},(v:any)=>{v.recordState={schema:'other',kind:'crm.handoff',state:'open'};},(v:any)=>{v.target='opportunities/other/handoffs/a';},(v:any)=>{if(v.canonicalUrl)v.canonicalUrl='https://evil.test/a';}]){f.control.alter=alter;await expect(f.verify()).rejects.toHaveProperty('code');expect((await f.state())!.receipt_json).toBeNull();}
 f.control.alter=undefined;
 for(const offset of [-61000,6000]){f.control.observedAt=()=>new Date(Date.now()+offset).toISOString();await expect(f.verify()).rejects.toMatchObject({code:'OWNING_STATE_STALE'});}
 expect((await f.state())!.state).toBe('pending');
});
test('procedure creation refuses an arbitrary connection or remote target outside its exact issued procedure',async()=>{
 const f=await owningFixture(),steps=f.task.steps.map(s=>({instruction:s.instruction,refs:JSON.parse(s.source_refs_json),verification:{...JSON.parse(s.verification_json),remoteId:'opportunities/o/handoffs/b'}}));
 await expect(createGuidedTask(f.context(),{operationKey:'arbitrary-guided-target',runId:f.runId,steps})).rejects.toMatchObject({code:'INVALID_GUIDED_GROUNDING'});
 expect((await f.state())!.state).toBe('pending');
});
test('local connection generation changing after a remote await refuses completion',async()=>{
 const f=await owningFixture();let once=false;f.control.after=async()=>{if(!once){once=true;await env.DB.prepare("UPDATE federation_connections SET revision_id='changed-generation' WHERE id=?").bind(f.connectionId).run();}};
 await expect(f.verify()).rejects.toMatchObject({code:'SOURCE_ACCESS_REVOKED'});expect((await f.state())!.receipt_json).toBeNull();
});
test('real D1 final batch fences task pause, connection generation, member and ACL changes atomically',async()=>{
 for(const kind of ['pause','connection','member','acl']){
  const f=await owningFixture();const ctx=f.context();let applied=false;ctx.db={prepare:env.DB.prepare.bind(env.DB),batch:async(statements:D1PreparedStatement[])=>{if(!applied){applied=true;if(kind==='pause')await env.DB.prepare("UPDATE intelligence_guided_tasks SET state='paused',revision_id='paused' WHERE id=?").bind(f.task.id).run();if(kind==='connection')await env.DB.prepare("UPDATE federation_connections SET revision_id='replacement' WHERE id=?").bind(f.connectionId).run();if(kind==='member')await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(f.owner).run();if(kind==='acl')await env.DB.prepare('UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1').run();}return env.DB.batch(statements);}} as D1Database;
  await expect(f.verify(ctx)).rejects.toHaveProperty('code');expect((await f.state())!.receipt_json).toBeNull();expect((await env.DB.prepare("SELECT count(*) n FROM operation_receipts WHERE operation_key='typed-verify-owning' AND workspace_id=?").bind(f.workspaceId).first<{n:number}>())!.n).toBe(0);
 }
});
test('scheduler isolates malformed and unavailable state; pending definitions are not completed',async()=>{
 const f=await owningFixture();await env.DB.prepare("UPDATE intelligence_guided_steps SET verification_json='broken' WHERE id=?").bind(f.stepId).run();await scheduleGuidedTasks({...env,CONNECTOR_CREDENTIALS_KEY:f.context().sourceSecret} as AppBindings,new Date().toISOString());expect((await f.state())!.state).toBe('pending');
});
test('concurrent and lost-response replay produce one receipt/activity; revoked replay discloses nothing',async()=>{
 const f=await owningFixture();const results=await Promise.all([f.verify(),f.verify()]);expect(results[0]!.value.receipt).toEqual(results[1]!.value.receipt);expect((await env.DB.prepare("SELECT count(*) n FROM activity_entries WHERE target_id=? AND action='skills.verify-step'").bind(f.task.id).first<{n:number}>())!.n).toBe(1);
 const replay=await f.verify();expect(replay.value.receipt).toEqual(results[0]!.value.receipt);
 await env.DB.prepare("UPDATE federation_connections SET credential_ciphertext=NULL,state='revoked' WHERE id=?").bind(f.connectionId).run();await expect(f.verify()).rejects.toHaveProperty('code');
});
test('a new owning revision between observations rejects the first attempt instead of accepting the replacement',async()=>{
 const f=await owningFixture();let once=false;f.control.after=async()=>{if(!once){once=true;f.control.revision='replacement-current-row';}};
 await expect(f.verify()).rejects.toMatchObject({code:'OWNING_STATE_CHANGED'});expect((await f.state())!.state).toBe('pending');
});
