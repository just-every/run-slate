import {test,expect,afterEach,vi,beforeEach} from 'vitest';
import {env} from 'cloudflare:test';
import {nativeTrial,effects,prepareEffect} from './native-trial';
import {executeTrial} from '../../../../src/core/features/experiments/execution';
import {observeTrial,requireTrial} from '../../../../src/core/features/experiments/service';
import {dispatchEffect,reconcileEffect} from '../../../../src/core/features/effects/service';
import {revokeGrant} from '../../../../src/core/features/effects/grants';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

let f:Awaited<ReturnType<typeof nativeTrial>>;
beforeEach(async({task})=>{f=task.name.includes('guardrail during')?await nativeTrial([1,1,1,8,8],3):await nativeTrial();await f.approve();f.advance(f.plan.measurement!.observeAfter);});

test('TRIAL-002 — guardrail during provider uncertainty cancels unsent work and preserves confirmed and uncertain truth',async()=>{
  let pendingId='',firstReceipt='';
  f.wire.hooks.send=async(_,index)=>{
    const rows=await effects(f.trialId);
    if(index===0) {pendingId=(await prepareEffect(f.context(),await f.declaredIntent(rows[0]!.run_id,2))).value.id;return;}
    if(index===1) {
      firstReceipt=rows[0]!.receipt_json!;expect(rows[0]!.state).toBe('confirmed');expect(rows[1]!.state).toBe('dispatched');expect(rows[2]!.state).toBe('prepared');
      await observeTrial(f.context(),{id:f.trialId,operationKey:'guardrail-during-request',subjectId:'comparison-3',value:8,supportWork:11,observedAt:f.context().now,refs:f.refs});
      throw new TypeError('Controlled lost provider response');
    }
  };
  expect((await executeTrial(f.context(),f.trialId)).state).toBe('pending');
  const rows=await effects(f.trialId);expect(rows.map(e=>e.state)).toEqual(['confirmed','uncertain','cancelled']);expect(rows[0]!.receipt_json).toBe(firstReceipt);expect(rows[1]!.receipt_json).toBeNull();expect(rows[1]!.dispatched_at).not.toBeNull();expect(rows[2]!.dispatched_at).toBeNull();
  expect((await requireTrial(f.context(),f.trialId)).state).toBe('stopped');
  await expect(dispatchEffect(f.context(),pendingId)).rejects.toMatchObject({code:'RUN_STOPPED'});
  await expect(prepareEffect(f.context(),{...await f.declaredIntent(rows[0]!.run_id,0),operationKey:'ungranted-compensation',content:{...f.plan.effects[0]!.content,status:'cancelled'}})).rejects.toMatchObject({code:'RUN_STOPPED'});
  await revokeGrant(f.context(),{id:rows[1]!.grant_id,operationKey:'revoke-uncertain-authority'});
  const requests=f.wire.requests.length;await expect(reconcileEffect(f.context(),rows[1]!.id)).rejects.toMatchObject({code:'GRANT_REQUIRED'});
  // Current authority is checked before any recovery request; identity/audience reads are allowed.
  expect(f.wire.requests.slice(requests).some(r=>r.includes('/effects'))).toBe(false);expect(f.wire.sends).toHaveLength(2);
  expect((await effects(f.trialId)).map(e=>[e.state,e.receipt_json])).toEqual(rows.map(e=>[e.state,e.receipt_json]));
});

test('TRIAL-002 — grant revoked after trial admission invalidates the D1 dispatch claim without a provider send',async()=>{
  let captured='';let armed=false;
  // During prepare, the effect row does not yet exist. During dispatch authorization it does.
  f.wire.hooks.audience=async()=>{if(armed)return;const rows=await effects(f.trialId);if(!rows.length)return;armed=true;captured=rows[0]!.id;const trial=await requireTrial(f.context(),f.trialId);await revokeGrant(f.context(),{id:trial.grant_id!,operationKey:'revoke-after-trial-admission'});};
  await expect(executeTrial(f.context(),f.trialId)).rejects.toBeTruthy();
  expect(armed).toBe(true);const row=(await effects(f.trialId))[0]!;expect(row.id).toBe(captured);expect(row.state).toBe('prepared');expect(row.dispatched_at).toBeNull();expect(f.wire.sends).toHaveLength(0);
  // Exact effect grant revocation performs the unsent cancellation as well.
  await revokeGrant(f.context(),{id:row.grant_id,operationKey:'cancel-unsent-exact-grant'});
  expect((await effects(f.trialId))[0]!.state).toBe('cancelled');
  await expect(dispatchEffect(f.context(),row.id)).rejects.toMatchObject({code:'GRANT_REQUIRED'});expect(f.wire.sends).toHaveLength(0);
});
