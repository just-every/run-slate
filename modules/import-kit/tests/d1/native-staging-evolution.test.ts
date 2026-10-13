import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture } from './native-staging-fixture.ts';
import { initializeD1ImportStorage, resumeD1ImportStream, undoD1ImportStream, eraseD1ImportTarget } from '../../src/d1/index.ts';

test('additive native custody migration preserves prior job bytes and cold resume, erasure and undo',async t=>{
  const r=await nativeStagingFixture(t),before=r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all();
  // Reconstruct the previous schema with its already-created public custody.
  const triggers=r.native().prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all() as {name:string;sql:string}[];
  for(const trigger of triggers)if(/ik_d1_custody_revisions|ik_d1_native_staging/.test(trigger.sql))r.native().exec(`DROP TRIGGER ${trigger.name}`);
  r.native().exec('DROP TABLE ik_d1_native_staging_values;DROP TABLE ik_d1_native_staging_index;DROP TABLE ik_d1_native_staging;DROP TABLE ik_d1_custody_revisions');
  r.reopen();await initializeD1ImportStorage(r.db());
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all(),before);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_custody_revisions').get()!.n,before.length);
  assert.equal((await resumeD1ImportStream(r.job.id,r.context())).state,'completed');
  r.reopen();await eraseD1ImportTarget('record','0',r.targets.remove('workspace','record','0'),r.context());
  assert.equal((await undoD1ImportStream(r.job.id,r.context())).state,'undone');
  assert.equal((await undoD1ImportStream(r.job.id,r.context())).state,'undone');
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_native_staging_values').get()!.n,0);
});
