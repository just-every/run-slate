import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture, nativePrivateTables } from './native-staging-fixture.ts';
import { initializeD1ImportStorage, resumeD1ImportStream, undoD1ImportStream, eraseD1ImportTarget } from '../../src/d1/index.ts';

test('additive custody revision migration preserves prior public bytes and cold erasure and undo',async t=>{
  const r=await nativeStagingFixture(t),before=r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all();
  const triggers=r.native().prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all() as {name:string;sql:string}[];
  for(const trigger of triggers)if(trigger.sql.includes('ik_d1_custody_states'))r.native().exec(`DROP TRIGGER ${trigger.name}`);
  r.native().exec('DROP TABLE ik_d1_custody_states');
  r.reopen();await initializeD1ImportStorage(r.db());
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all(),before);
  const counters=r.native().prepare('SELECT * FROM ik_d1_custody_states ORDER BY job_id').all();
  assert.equal(counters.length,before.length);
  assert.ok(counters.every(row=>row.revision===0));
  await initializeD1ImportStorage(r.db());
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_custody_states ORDER BY job_id').all(),counters);
  assert.equal((await resumeD1ImportStream(r.job.id,r.context())).state,'completed');
  assert.ok(r.native().prepare('SELECT * FROM ik_d1_custody_states').all().some(row=>Number(row.revision)>0));
  r.reopen();await eraseD1ImportTarget('record','0',r.targets.remove('workspace','record','0'),r.context());
  assert.equal((await undoD1ImportStream(r.job.id,r.context())).state,'undone');
  assert.equal((await undoD1ImportStream(r.job.id,r.context())).state,'undone');
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
});

test('custody revisions cover parent, membership and body writes and cannot rewind or disappear',async t=>{
  const r=await nativeStagingFixture(t),id=r.native().prepare('SELECT id FROM ik_jobs LIMIT 1').get()!.id;
  const revision=()=>Number(r.native().prepare('SELECT revision FROM ik_d1_custody_states WHERE job_id=?').get(id)!.revision);
  for(const statement of [
    'UPDATE ik_jobs SET checkpoint=checkpoint WHERE id=?',
    'UPDATE ik_originals SET name=name WHERE job_id=?',
    'UPDATE ik_d1_stream_pages SET total=total WHERE job_id=?',
    'UPDATE ik_d1_streams SET total=total WHERE id=(SELECT stream_id FROM ik_d1_stream_pages WHERE job_id=?)',
  ]){const before=revision();r.native().prepare(statement).run(id);assert.ok(revision()>before,statement);}
  const before=revision();
  assert.throws(()=>r.native().prepare('UPDATE ik_d1_custody_states SET revision=? WHERE job_id=?').run(before,id),/IMPORT_CUSTODY_STATE_CHANGED/);
  assert.throws(()=>r.native().prepare('UPDATE ik_d1_custody_states SET revision=? WHERE job_id=?').run(before-1,id),/IMPORT_CUSTODY_STATE_CHANGED/);
  assert.throws(()=>r.native().prepare('DELETE FROM ik_d1_custody_states WHERE job_id=?').run(id),/IMPORT_CUSTODY_STATE_CHANGED/);
  assert.equal(revision(),before);
});
