import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {fixture} from '../inquiry/fixture';
import {startRun,controlRun,startSuccessor} from '../../../src/core/features/runs/service';
import {requireRun,reauthorizeRun} from '../../../src/core/features/runs/repository';

test('AI-006 FLAG-004 — restore permits explicit cancellation and a separately authorized successor, never automatic resume',async()=>{
 const f=await fixture(),ctx=f.context();
 const original=await startRun(ctx,f.ask,{apiKey:'test-only'});
 await env.DB.prepare("UPDATE intelligence_runs SET status='paused',failure_reason='RESTORED_AUTHORITY_REQUIRED',input_json=json_set(input_json,'$.recoveryPausedAt',?) WHERE id=?").bind(ctx.now,original.value.id).run();
 await expect(startSuccessor(f.context(),original.value.id,{...f.ask,operationKey:crypto.randomUUID()},{apiKey:'test-only'})).rejects.toMatchObject({status:409,code:'PRIOR_RUN_ACTIVE'});
 await controlRun(f.context(),{id:original.value.id,operationKey:crypto.randomUUID(),expectedRevisionId:original.value.revisionId,action:'cancel'});
 const cancelled=await requireRun(f.context(),original.value.id);
 expect(cancelled.status).toBe('cancelled');
 expect(JSON.parse(cancelled.input_json).recoveryPausedAt).toBe(ctx.now);
 await expect(startRun(f.context(),f.ask,{apiKey:'test-only'})).rejects.toMatchObject({status:409,code:'RESTORED_AUTHORITY_REQUIRED'});
 const successor=await startSuccessor(f.context(),original.value.id,{...f.ask,operationKey:crypto.randomUUID()},{apiKey:'test-only'});
 const fresh=await requireRun(f.context(),successor.value.id);
 expect(fresh).toMatchObject({parent_id:original.value.id,status:'queued',agent_credential_id:null});
 expect(JSON.parse(fresh.input_json).recoveryPausedAt).toBeUndefined();
 expect(await reauthorizeRun(f.context(),fresh)).toHaveLength(f.refs.length);
 // A successor still checks current owner enablement and budget authority.
 await env.DB.prepare('UPDATE workspaces SET ai_monthly_budget_micros=1 WHERE id=?').bind(f.workspaceId).run();
 await expect(reauthorizeRun(f.context(),fresh)).rejects.toMatchObject({status:429,code:'BUDGET_EXHAUSTED'});
 await env.DB.prepare('UPDATE workspaces SET ai_enabled=0 WHERE id=?').bind(f.workspaceId).run();
 await expect(reauthorizeRun(f.context(),fresh)).rejects.toMatchObject({status:403,code:'AI_DISABLED'});
});
