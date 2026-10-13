import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedRuntime } from './retained-fixtures.ts';
import { sqliteSource,sqliteMapping } from './sqlite-runtime.ts';
import { planIndex } from '../../src/d1/erasure-index.ts';
import { planD1Import,createD1ImportJob,resumeD1Import,undoD1Import,planD1ImportStream,createD1ImportStream,resumeD1ImportStream,readD1ImportJob,eraseD1ImportTarget,undoD1ImportStream } from '../../src/d1/index.ts';

for(const mutation of ['source','target','source tombstone','target tombstone'])test(`cold erased membership rejects changed ${mutation} despite a replaced completeness receipt`,async t=>{
  const r=await boundedRuntime(t),source=sqliteSource(1);source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const plan=await planD1ImportStream(source,sqliteMapping,r.context()),stream=await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
  await resumeD1ImportStream(stream.id,r.context());
  const original=r.native().prepare('SELECT * FROM ik_d1_plan_index').get()!;
  await eraseD1ImportTarget('record','0',r.context().storage.targets.remove('workspace','record','0'),r.context());
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_plan_index').get(),original);
  r.reopen();assert.equal((await readD1ImportJob(original.job_id as string,r.context())).erasedRecords,1);
  if(mutation.endsWith('tombstone'))r.native().exec(`DELETE FROM ${mutation==='source tombstone'?'ik_d1_erased_sources':'ik_d1_erased_targets'}`);
  else{
    const column=mutation==='source'?'source_identity':'target_identity';
    r.native().prepare(`UPDATE ik_d1_plan_index SET ${column}=?`).run('a'.repeat(64));
    r.native().exec('INSERT OR REPLACE INTO ik_d1_indexed_jobs(job_id,fingerprint) SELECT id,fingerprint FROM ik_jobs');
  }
  const before=r.native().prepare('SELECT * FROM ik_jobs').all();r.reopen();
  await assert.rejects(readD1ImportJob(original.job_id as string,r.context()),/IMPORT_ATOMIC_GUARD|malformed JSON/);
  await assert.rejects(undoD1ImportStream(stream.id,r.context()),/IMPORT_ATOMIC_GUARD|malformed JSON/);
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs').all(),before);
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
});

test('fresh zero-effect entries retain empty membership without becoming erased entries',async t=>{
  const r=await boundedRuntime(t),source=sqliteSource(1);source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const plan=await planD1ImportStream(source,{version:'v1',map:()=>({effects:[],unmapped:[{reason:'source has no native effect'}]})},r.context()),stream=await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
  assert.equal((await resumeD1ImportStream(stream.id,r.context())).state,'completed');r.reopen();
  const row=r.native().prepare('SELECT * FROM ik_d1_plan_index').get()!;
  assert.equal(row.target_identity,'');assert.equal((await readD1ImportJob(row.job_id as string,r.context())).erasedRecords,0);
});

test('an erased snapshot without its original target binding fails closed',()=>{
  assert.throws(()=>planIndex({entries:[{identity:'source',effects:[],erased:true}]} as any,'job'),/IMPORT_ERASURE_BINDING_MISSING/);
});

test('prior ordinary live custody acquires exact erased membership before cold bounded undo',async t=>{
  const r=await boundedRuntime(t),source=sqliteSource(1);source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const ordinary=()=>({...r.context(),maxBatchBytes:undefined}),plan=await planD1Import(source,sqliteMapping,ordinary()),job=await createD1ImportJob(plan,{...ordinary(),reviewedFingerprint:plan.fingerprint});
  await resumeD1Import(job.id,ordinary());
  const original=r.native().prepare('SELECT * FROM ik_d1_plan_index').get()!;
  await eraseD1ImportTarget('record','0',r.context().storage.targets.remove('workspace','record','0'),r.context());r.reopen();
  assert.equal((await readD1ImportJob(job.id,r.context())).erasedRecords,1);
  assert.equal((await undoD1Import(job.id,r.context())).state,'undone');
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_plan_index').get(),original);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_erased_sources').get()!.n,1);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_erased_targets').get()!.n,1);
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
});
