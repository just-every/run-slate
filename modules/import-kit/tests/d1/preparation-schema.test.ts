import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime,sqliteSource,sqliteMapping } from './sqlite-runtime.ts';
import { d1PreparationSchema,initializeD1ImportStorage,planD1Import,createD1ImportJob,readD1ImportJob,planD1ImportStream,createD1ImportStream,readD1ImportStream } from '../../src/d1/index.ts';
import { normalizedPreparation } from './preparation-fixture.ts';

test('preparation evolution preserves populated ordinary version-three and published stream custody',async t=>{
  const r=await sqliteRuntime(t),eager=await planD1Import(sqliteSource(1),sqliteMapping,r.context());
  const job=await createD1ImportJob(eager,{...r.context(),reviewedFingerprint:eager.fingerprint});
  const plan=await planD1ImportStream(normalizedPreparation(3),sqliteMapping,r.context()),stream=await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
  const tables=['ik_jobs','ik_originals','ik_original_sets','ik_d1_streams','ik_d1_stream_pages','ik_d1_plan_chunks','ik_d1_plan_index'];
  const snapshot=()=>tables.map(table=>r.native().prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const before=snapshot();assert.equal(r.native().prepare('SELECT version FROM ik_original_sets WHERE job_id=?').get(job.id)!.version,3);
  const names=r.native().prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'ik_d1_preparation_%' OR name LIKE 'ik_d1_staging_headers_%')").all();
  for(const row of names)r.native().exec(`DROP TRIGGER "${row.name}"`);
  r.native().exec('DROP TABLE ik_d1_staging_headers;DROP TABLE ik_d1_preparation_receipts');
  await r.db().batch(d1PreparationSchema.map(query=>r.db().prepare(query)));
  await initializeD1ImportStorage(r.db());r.reopen();
  assert.deepEqual(snapshot(),before);assert.equal((await readD1ImportJob(job.id,r.context())).id,job.id);assert.equal((await readD1ImportStream(stream.id,r.context())).id,stream.id);
});
