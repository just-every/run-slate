import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime,sqliteMapping } from './sqlite-runtime.ts';
import { planD1ImportStream,prepareD1ImportStream,publishD1ImportPreparation,readD1ImportPreparation,cancelD1ImportStaging,eraseD1ImportTarget } from '../../src/d1/index.ts';
import { normalizedPreparation,emptyPreparationTables,publicPreparationTables,observePreparation } from './preparation-fixture.ts';

test('an interrupted preparation reports its state and a generation-fenced retry can complete it',async t=>{
  const r=await sqliteRuntime(t),source=normalizedPreparation(3),review=await planD1ImportStream(source,sqliteMapping,r.context());let stopped=false;
  const database=observePreparation(r.db(),queries=>{if(queries.some(query=>query.startsWith('INSERT INTO ik_d1_staging_headers')))stopped=true;if(stopped)throw new Error('runtime stopped');});
  await assert.rejects(prepareD1ImportStream(source,sqliteMapping,{...r.context(),reviewedFingerprint:review.fingerprint,storage:{...r.context().storage,database}}),/runtime stopped/);
  const prior=r.native().prepare('SELECT id FROM ik_d1_staging').get()!;
  assert.equal((await readD1ImportPreparation(String(prior.id),r.context())).state,'preparation-interrupted');
  r.reopen();const prepared=await prepareD1ImportStream(source,sqliteMapping,{...r.context(),reviewedFingerprint:review.fingerprint});
  assert.notEqual(prepared.id,prior.id);assert.equal(prepared.state,'preparing');
  assert.equal((await publishD1ImportPreparation(prepared.id,r.context())).id,prepared.id);emptyPreparationTables(r.native());
});

test('a concurrent verified winner cannot turn different unverified submitted values into a successful replay',async t=>{
  const r=await sqliteRuntime(t),source=normalizedPreparation(3),review=await planD1ImportStream(source,sqliteMapping,r.context());
  const changed=normalizedPreparation(3,'different submitted values');let raced=false,winnerId='';
  const database=observePreparation(r.db(),async queries=>{
    if(!raced&&queries.some(query=>query.startsWith('INSERT INTO ik_d1_staging('))){
      raced=true;
      const winner=await prepareD1ImportStream(source,sqliteMapping,{...r.context(),reviewedFingerprint:review.fingerprint});
      winnerId=(await publishD1ImportPreparation(winner.id,r.context())).id;
    }
  });
  await assert.rejects(prepareD1ImportStream(changed,sqliteMapping,{...r.context(),reviewedFingerprint:review.fingerprint,storage:{...r.context().storage,database}}),/IMPORT_ATOMIC_GUARD/);
  assert.equal(raced,true);assert.equal(r.native().prepare('SELECT id FROM ik_d1_streams').get()!.id,winnerId);
  emptyPreparationTables(r.native());
  await assert.rejects(prepareD1ImportStream(changed,sqliteMapping,{...r.context(),reviewedFingerprint:review.fingerprint}),/REVIEW_FINGERPRINT_MISMATCH/);
  assert.equal((await prepareD1ImportStream(source,sqliteMapping,{...r.context(),reviewedFingerprint:review.fingerprint})).id,winnerId);
});
