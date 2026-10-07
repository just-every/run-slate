import {test,expect,afterEach,vi,beforeEach} from 'vitest';
import {env} from 'cloudflare:test';
import {nativeTrial,effects,prepareEffect} from './native-trial';
import {seedPageGrant} from '../../../e2e/setup/fixtures';
import {prepareTrial,approveTrial,requireTrial} from '../../../../src/core/features/experiments/service';
import {executeTrial} from '../../../../src/core/features/experiments/execution';
import {requestHash} from '../../../../src/core/app/operations';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

let f:Awaited<ReturnType<typeof nativeTrial>>;
beforeEach(async()=>{f=await nativeTrial([1,1,8,8],2,true);});

test('TRIAL-001 — immutable predeclaration rejects changed replay and unappointed or stale approval',async()=>{
  const before=await requireTrial(f.context(),f.trialId);
  expect(before.state).toBe('prepared'); expect(before.grant_id).toBeNull();
  expect(f.plan).toMatchObject({...f.input.plan,effects:f.input.plan.effects.map(e=>({...e,audience:[f.owner,f.reader]})),instrumentationRevision:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(await env.DB.prepare('SELECT content_json FROM intelligence_revisions WHERE id=?').bind(f.prepared.value.revisionId).first<string>('content_json')).toBe(before.plan_json);
  expect((await prepareTrial(f.context(),f.input)).value).toEqual(f.prepared.value);
  for(const change of [{forecast:'A rewritten forecast'},{assignment:f.plan.assignment.map((a,i)=>({...a,arm:i%2?'treatment' as const:'comparison' as const}))},{endsAt:'2028-01-01T00:03:00.000Z'}]) {
    await expect(prepareTrial(f.context(),{...f.input,plan:{...f.input.plan,...change}})).rejects.toMatchObject({code:'OPERATION_KEY_CONFLICT'});
    expect((await requireTrial(f.context(),f.trialId)).plan_json).toBe(before.plan_json);
  }
  await expect(approveTrial(f.context(),{id:f.trialId,operationKey:'stale-approve',expectedRevisionId:'stale-version'})).rejects.toMatchObject({code:'TRIAL_CHANGED'});
  await seedPageGrant(f.page.pageId,{principalKind:'member',principalId:f.reader,level:'full'});
  expect((await requireTrial(f.context(f.reader),f.trialId,true)).id).toBe(f.trialId);
  await expect(approveTrial(f.context(f.reader),{id:f.trialId,operationKey:'unappointed-approve',expectedRevisionId:f.prepared.value.revisionId})).rejects.toMatchObject({status:403,code:'FORBIDDEN'});
  expect(await effects(f.trialId)).toEqual([]);expect(f.wire.sends).toHaveLength(0);
  const changed=await prepareTrial(f.context(),{...f.input,operationKey:'new-plan-revision',plan:{...f.input.plan,forecast:'A newly declared forecast'}});
  expect(changed.value.id).not.toBe(f.trialId);expect(changed.value.revisionId).not.toBe(f.prepared.value.revisionId);
  expect((await requireTrial(f.context(),f.trialId)).plan_json).toBe(before.plan_json);
  f.advance(f.plan.startsAt);
  await expect(executeTrial(f.context(),f.trialId)).rejects.toMatchObject({code:'TRIAL_NOT_EXECUTABLE'});
  expect(await effects(f.trialId)).toEqual([]);expect(f.wire.sends).toHaveLength(0);
});

test('TRIAL-001 — exact approved plan grants only its declared treatment targets and content',async()=>{
  const before=await requireTrial(f.context(),f.trialId);
  await f.approve();const active=await requireTrial(f.context(),f.trialId);
  const scope=JSON.parse((await env.DB.prepare('SELECT scope_json FROM intelligence_grants WHERE id=?').bind(active.grant_id).first<string>('scope_json'))!);
  expect(scope).toMatchObject({contentHash:await requestHash(f.plan),operations:['trial.execute'],targets:[f.trialId],conditions:{contactLimit:'0',endsAt:f.plan.endsAt}});
  f.advance(f.plan.measurement!.observeAfter);
  // Probe the real running procedure before its first provider send completes.
  f.wire.hooks.send=async(_,index)=>{if(index!==0)return;const row=(await effects(f.trialId))[0]!;const intent=await f.declaredIntent(row.run_id,0);
    await expect(prepareEffect(f.context(),{...intent,operationKey:'undeclared-target',target:'opportunities/o/handoffs/not-assigned'})).rejects.toMatchObject({code:'TRIAL_EFFECT_MISMATCH'});
    await expect(prepareEffect(f.context(),{...intent,operationKey:'undeclared-content',content:{...intent.content,title:'Unapproved content'}})).rejects.toMatchObject({code:'TRIAL_EFFECT_MISMATCH'});
  };
  expect((await executeTrial(f.context(),f.trialId)).state).toBe('observing');
  expect(f.wire.sends).toHaveLength(2); expect((await effects(f.trialId)).map(e=>e.state)).toEqual(['confirmed','confirmed']);
  expect((await requireTrial(f.context(),f.trialId)).plan_json).toBe(before.plan_json);
});
