import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime,sqliteMapping,sqliteTargets } from './sqlite-runtime.ts';
import { planD1ImportStream,prepareD1ImportStream,publishD1ImportPreparation,readD1ImportPreparation,readD1ImportStream,readD1ImportJob,resumeD1ImportStream,undoD1ImportStream,cancelD1ImportStaging,type D1PlanCodec,type ImportPlan,type Json } from '../../src/d1/index.ts';
import { normalizedPreparation,emptyPreparationTables,publicPreparationTables } from './preparation-fixture.ts';

for(const codec of [undefined,{id:'full-json-v1',encode:(plan:ImportPlan)=>structuredClone(plan) as unknown as Json,decode:(value:Json)=>structuredClone(value) as unknown as ImportPlan} satisfies D1PlanCodec])test(`unverified ${codec?'codec':'inline'} preparation cold-verifies exact canonical values before publication`,async t=>{
  const r=await sqliteRuntime(t),source=normalizedPreparation(),context=()=>({...r.context(),storage:{database:r.db(),targets:{...sqliteTargets,...(codec?{planCodec:codec}:{})}}});
  const mapping={...sqliteMapping};
  const reviewed=await planD1ImportStream(source,mapping,context());emptyPreparationTables(r.native());emptyPreparationTables(r.native(),publicPreparationTables);
  const prepared=await prepareD1ImportStream(source,mapping,{...context(),reviewedFingerprint:reviewed.fingerprint});
  assert.deepEqual(prepared,{id:prepared.id,state:'preparing',expectedFingerprint:reviewed.fingerprint,checkpoint:0,total:source.records.length,error:null});
  emptyPreparationTables(r.native(),publicPreparationTables);
  assert.ok(r.native().prepare('SELECT count(*) n FROM ik_d1_staging_headers').get()!.n>0);
  await assert.rejects(readD1ImportJob(prepared.id,context()));await assert.rejects(readD1ImportStream(prepared.id,context()));
  assert.deepEqual(await readD1ImportPreparation(prepared.id,context()),prepared);
  assert.equal((await prepareD1ImportStream(source,mapping,{...context(),reviewedFingerprint:reviewed.fingerprint})).id,prepared.id);
  mapping.map=()=>{throw new Error('cold continuation called the mapper');};r.reopen();
  let job=await publishD1ImportPreparation(prepared.id,context());
  assert.equal(job.fingerprint,reviewed.fingerprint);assert.equal(job.checkpoint,0);emptyPreparationTables(r.native());
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  while(job.state!=='completed')job=await resumeD1ImportStream(job.id,context());
  const values=await sqliteTargets.list(r.db(),'workspace');assert.equal(values.length,source.records.length);
  for(const record of source.records)assert.deepEqual(values.find(value=>value.targetId===record.sourceId)?.value,record.payload);
  while(job.state!=='undone')job=await undoD1ImportStream(job.id,context());
  assert.equal((await sqliteTargets.list(r.db(),'workspace')).length,0);
});

test('the supplied fingerprint remains unverified until cold comparison and failure removes its private generation',async t=>{
  const r=await sqliteRuntime(t),source=normalizedPreparation(3);
  const prepared=await prepareD1ImportStream(source,sqliteMapping,{...r.context(),reviewedFingerprint:'0'.repeat(64)});
  assert.equal(prepared.state,'preparing');emptyPreparationTables(r.native(),publicPreparationTables);
  await assert.rejects(publishD1ImportPreparation(prepared.id,r.context()),/REVIEW_FINGERPRINT_MISMATCH/);
  emptyPreparationTables(r.native());emptyPreparationTables(r.native(),publicPreparationTables);
});

test('preparation reads, replay and cancellation are principal-bound',async t=>{
  const r=await sqliteRuntime(t),source=normalizedPreparation(3),review=await planD1ImportStream(source,sqliteMapping,r.context()),input={...r.context(),reviewedFingerprint:review.fingerprint};
  const prepared=await prepareD1ImportStream(source,sqliteMapping,input),other={...r.context(),authorization:{...r.context().authorization,principalId:'other'}};
  await assert.rejects(readD1ImportPreparation(prepared.id,other),/IMPORT_PREPARATION_NOT_FOUND/);
  await assert.rejects(publishD1ImportPreparation(prepared.id,other),/IMPORT_PREPARATION_NOT_FOUND/);
  await cancelD1ImportStaging(review.fingerprint,other);assert.equal((await readD1ImportPreparation(prepared.id,r.context())).id,prepared.id);
  await cancelD1ImportStaging(review.fingerprint,input);emptyPreparationTables(r.native());emptyPreparationTables(r.native(),publicPreparationTables);
});
