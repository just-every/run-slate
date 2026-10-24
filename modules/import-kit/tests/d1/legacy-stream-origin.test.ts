import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyStreamOriginFixture } from './legacy-stream-origin-fixture.ts';
import { sqliteRuntime } from './retained-fixtures.ts';
import { sqliteSource,sqliteMapping } from './sqlite-runtime.ts';
import { initializeD1ImportStorage,d1LegacyStreamReceiptUpgrade,readD1ImportJob,readD1ImportUndoReport,applyD1ImportBatches,undoD1Import,readD1ImportStream,resumeD1ImportStream,undoD1ImportStream,planD1ImportStream,createD1ImportStream } from '../../src/d1/index.ts';

test('structural legacy adoption preserves ordinary prior data and is idempotent with existing staging',async t=>{
  const r=await legacyStreamOriginFixture(t),jobs=r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all().map(row=>Object.assign(row,{reversal_conversion_hash:null})),native=r.native().prepare('SELECT * FROM native_records').all();
  await initializeD1ImportStorage(r.db());
  const origins=r.native().prepare('SELECT * FROM ik_d1_stream_origins').all();assert.equal(origins.length,1);assert.equal(origins[0].job_id,'child');assert.equal(origins[0].stream_id,'parent');assert.equal(origins[0].job_operation_key,'opaque-member-operation');
  assert.equal(r.native().prepare("SELECT version FROM ik_original_sets WHERE job_id='ordinary'").get()!.version,3);
  assert.equal(r.native().prepare("SELECT version FROM ik_original_sets WHERE job_id='child'").get()!.version,4);
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all(),jobs);assert.deepEqual(r.native().prepare('SELECT * FROM native_records').all(),native);
  await initializeD1ImportStorage(r.db());assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_stream_origins').all(),origins);
  // Reproduce the immediately prior additive schema, retaining all public data.
  for(const row of r.native().prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all())if(String(row.sql).includes('ik_d1_stream_origins'))r.native().exec(`DROP TRIGGER ${row.name}`);
  r.native().exec("DROP TABLE ik_d1_stream_origins;UPDATE ik_original_sets SET version=3 WHERE job_id='child'");r.reopen();await initializeD1ImportStorage(r.db());
  assert.equal(r.native().prepare("SELECT version FROM ik_original_sets WHERE job_id='child'").get()!.version,4);
  assert.equal(r.native().prepare("SELECT version FROM ik_original_sets WHERE job_id='ordinary'").get()!.version,3);
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_stream_origins').all(),origins);assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all(),jobs);
  assert.equal((await readD1ImportJob('ordinary',r.context())).state,'queued');assert.equal((await readD1ImportUndoReport('ordinary',r.context())).policy,'strict');
  assert.equal((await applyD1ImportBatches('ordinary',r.context())).state,'completed');assert.equal((await undoD1Import('ordinary',r.context())).state,'undone');
  assert.equal((await resumeD1ImportStream('parent',r.context())).state,'completed');assert.equal((await undoD1ImportStream('parent',r.context())).state,'undone');
  r.reopen();assert.equal((await readD1ImportStream('parent',r.context())).state,'undone');assert.equal((await undoD1Import('ordinary',r.context())).state,'undone');assert.deepEqual(r.native().prepare('SELECT * FROM native_records').all(),native);
});

test('a captured downgraded orphan remains closed while origin-free legacy custody remains usable',async t=>{
  const r=await legacyStreamOriginFixture(t);await initializeD1ImportStorage(r.db());
  const origin=r.native().prepare("SELECT * FROM ik_d1_stream_origins WHERE job_id='child'").get();
  r.native().exec("UPDATE ik_original_sets SET version=3 WHERE job_id='child';UPDATE ik_jobs SET reversal_policy_hash=NULL WHERE id='child';DELETE FROM ik_d1_stream_pages WHERE stream_id='parent';DELETE FROM ik_d1_streams WHERE id='parent'");
  assert.deepEqual(r.native().prepare("SELECT * FROM ik_d1_stream_origins WHERE job_id='child'").get(),origin);
  r.reopen();await assert.rejects(readD1ImportJob('child',r.context()),/IMPORT_(?:ATOMIC_GUARD|STREAM_LAYOUT_CHANGED)/);
  await assert.rejects(r.db().batch(d1LegacyStreamReceiptUpgrade.map(sql=>r.db().prepare(sql))),/IMPORT_ATOMIC_GUARD/);
  assert.equal(r.native().prepare("SELECT version FROM ik_original_sets WHERE job_id='child'").get()!.version,3);
  assert.equal((await readD1ImportJob('ordinary',r.context())).state,'queued');assert.equal(r.native().prepare("SELECT count(*) n FROM ik_d1_stream_origins WHERE job_id='ordinary'").get()!.n,0);
  r.native().exec("DELETE FROM ik_original_sets WHERE job_id='child';DELETE FROM ik_jobs WHERE id='child'");
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_stream_origins').get()!.n,0);assert.equal((await readD1ImportJob('ordinary',r.context())).state,'queued');
});

test('stream origins resist replacement and retain the exact original parent and operation binding',async t=>{
  const r=await legacyStreamOriginFixture(t);await initializeD1ImportStorage(r.db());
  const origin=r.native().prepare('SELECT * FROM ik_d1_stream_origins').get();
  assert.throws(()=>r.native().exec("UPDATE ik_d1_stream_origins SET stream_id='other'"),/IMPORT_STREAM_ORIGIN_CHANGED/);
  assert.throws(()=>r.native().exec('DELETE FROM ik_d1_stream_origins'),/IMPORT_STREAM_ORIGIN_CHANGED/);
  assert.throws(()=>r.native().exec('INSERT OR REPLACE INTO ik_d1_stream_origins SELECT * FROM ik_d1_stream_origins'),/IMPORT_STREAM_ORIGIN_CHANGED/);
  r.native().exec("UPDATE ik_jobs SET operation_key='changed-member' WHERE id='child'");await assert.rejects(readD1ImportJob('child',r.context()),/IMPORT_(?:ATOMIC_GUARD|STREAM_LAYOUT_CHANGED)/);
  r.native().exec("UPDATE ik_jobs SET operation_key='opaque-member-operation' WHERE id='child'");
  const parent=r.native().prepare("SELECT * FROM ik_d1_streams WHERE id='parent'").get()!,page=r.native().prepare("SELECT * FROM ik_d1_stream_pages WHERE job_id='child'").get()!;
  r.native().exec("DELETE FROM ik_d1_stream_pages WHERE stream_id='parent';DELETE FROM ik_d1_streams WHERE id='parent'");
  const changed={...parent,fingerprint:'f'.repeat(64)};
  r.native().prepare(`INSERT INTO ik_d1_streams(${Object.keys(changed).join(',')}) VALUES(${Object.keys(changed).map(()=>'?').join(',')})`).run(...Object.values(changed));
  r.native().prepare(`INSERT INTO ik_d1_stream_pages(${Object.keys(page).join(',')}) VALUES(${Object.keys(page).map(()=>'?').join(',')})`).run(...Object.values(page));
  r.native().exec("UPDATE ik_d1_streams SET state='applying' WHERE id='parent'");
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_stream_origins').get(),origin);
  await assert.rejects(readD1ImportJob('child',r.context()),/IMPORT_(?:ATOMIC_GUARD|STREAM_LAYOUT_CHANGED)/);await assert.rejects(readD1ImportStream('parent',r.context()),/IMPORT_(?:ATOMIC_GUARD|STREAM_LAYOUT_CHANGED)/);
});

test('failed stream publication rolls back the structural origin together with all public custody',async t=>{
  const r=await sqliteRuntime(t),source=sqliteSource(1);source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const plan=await planD1ImportStream(source,sqliteMapping,r.context());
  r.native().exec("CREATE TRIGGER reject_origin_publication BEFORE INSERT ON ik_original_sets WHEN NEW.version=4 BEGIN SELECT RAISE(ABORT,'INJECT_ORIGIN_PUBLICATION');END");
  await assert.rejects(createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint}),/INJECT_ORIGIN_PUBLICATION/);
  for(const table of ['ik_d1_stream_origins','ik_jobs','ik_d1_streams','ik_d1_stream_pages','ik_original_sets','ik_d1_plan_index','ik_d1_staging','ik_d1_staging_pages','ik_d1_staging_index','ik_d1_staging_chunks','ik_d1_staging_originals','ik_d1_publication_fences','ik_d1_assertions'])assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
});
