import test from 'node:test';
import assert from 'node:assert/strict';
import { originDepthFixture } from './d1/origin-depth-fixture.ts';
import { source, mapping } from './d1/fixtures.ts';
import { initializeD1ImportStorage, planD1ImportStream, createD1ImportStream, readD1ImportStream, readD1ImportJob, resumeD1ImportStream, undoD1ImportStream, resumeD1Import } from '../src/d1/index.ts';

test('real D1 origin predicates fit its depth limit through setup, live parent lifecycle and cold replay',async t=>{
  const r=await originDepthFixture(t),bundle=source(101);
  bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
  const plan=await r.request('plan',()=>planD1ImportStream(bundle,mapping,r.context()));
  assert.equal(plan.pages.length,2);
  const reviewed=()=>({...r.context(),reviewedFingerprint:plan.fingerprint});
  let job=await r.request('create',()=>createD1ImportStream(plan,reviewed()));
  const pages=(await r.db().prepare('SELECT * FROM ik_d1_stream_pages WHERE stream_id=? ORDER BY ordinal').bind(job.id).all()).results;
  const origins=(await r.db().prepare('SELECT * FROM ik_d1_stream_origins ORDER BY ordinal').all()).results;
  assert.equal(origins.length,2);assert.equal(Object.keys(origins[0]).length,13);
  assert.deepEqual(origins.map(row=>[row.stream_id,row.job_id,row.ordinal]),pages.map(row=>[row.stream_id,row.job_id,row.ordinal]));
  await r.request('initialize-live',()=>initializeD1ImportStorage(r.context().storage.database));
  assert.deepEqual((await r.db().prepare('SELECT * FROM ik_d1_stream_origins ORDER BY ordinal').all()).results,origins);
  assert.equal((await r.request('read-parent',()=>readD1ImportStream(job.id,r.context()))).checkpoint,0);
  assert.equal((await r.request('read-child',()=>readD1ImportJob(pages[0].job_id,r.context()))).checkpoint,0);
  await assert.rejects(r.request('child-order',()=>resumeD1Import(pages[1].job_id,r.context())),/IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.request('creation-replay',()=>createD1ImportStream(plan,reviewed()))).id,job.id);
  await r.db().prepare('UPDATE sessions SET enabled=0').run();
  await assert.rejects(r.request('current-authority',()=>resumeD1ImportStream(job.id,r.context())),/IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT count(*) n FROM contacts').first()).n,0);
  await r.db().prepare('UPDATE sessions SET enabled=1').run();
  for(let round=0;job.state!=='completed';round++){
    assert.ok(round<4);job=await r.request('apply-'+round,()=>resumeD1ImportStream(job.id,r.context()));
  }
  assert.equal(job.checkpoint,101);
  assert.deepEqual((await r.db().prepare('SELECT id,email FROM contacts ORDER BY CAST(id AS INTEGER)').all()).results,bundle.records.map(record=>({id:record.sourceId,email:(record.payload as any).email})));
  await r.reopen();
  assert.equal((await r.request('cold-parent',()=>readD1ImportStream(job.id,r.context()))).state,'completed');
  assert.equal((await r.request('cold-replay',()=>createD1ImportStream(plan,reviewed()))).id,job.id);
  for(let round=0;job.state!=='undone';round++){
    assert.ok(round<4);job=await r.request('undo-'+round,()=>undoD1ImportStream(job.id,r.context()));
  }
  assert.equal((await r.db().prepare('SELECT count(*) n FROM contacts').first()).n,0);
  assert.equal((await r.db().prepare('SELECT count(*) n FROM evidence').first()).n,0);
  await r.reopen();
  assert.equal((await r.request('cold-undone',()=>readD1ImportStream(job.id,r.context()))).state,'undone');
  assert.equal((await r.request('undo-replay',()=>undoD1ImportStream(job.id,r.context()))).state,'undone');
  assert.equal((await r.request('final-replay',()=>createD1ImportStream(plan,reviewed()))).id,job.id);
  assert.deepEqual((await r.db().prepare('SELECT * FROM ik_d1_stream_origins ORDER BY ordinal').all()).results,origins);
  for(const table of ['ik_d1_staging','ik_d1_staging_pages','ik_d1_staging_chunks','ik_d1_staging_index','ik_d1_staging_originals','ik_d1_native_staging','ik_d1_assertions'])assert.equal((await r.db().prepare(`SELECT count(*) n FROM ${table}`).first()).n,0,table);
  t.diagnostic(JSON.stringify(r.summary()));
});

test('real D1 balanced origin guards reject changed parent binding and captured orphans',async t=>{
  const r=await originDepthFixture(t),bundle=source(1);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
  const plan=await r.request('plan',()=>planD1ImportStream(bundle,mapping,r.context()));
  const job=await r.request('create',()=>createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint}));
  const origin=await r.db().prepare('SELECT * FROM ik_d1_stream_origins').first();
  await assert.rejects(r.db().prepare("UPDATE ik_d1_stream_origins SET stream_id='changed'").run(),/IMPORT_STREAM_ORIGIN_CHANGED/);
  await r.db().prepare("UPDATE ik_d1_streams SET fingerprint='changed' WHERE id=?").bind(job.id).run();
  await assert.rejects(r.request('changed-parent-read',()=>readD1ImportJob(origin.job_id,r.context())),/IMPORT_(?:ATOMIC_GUARD|STREAM_LAYOUT_CHANGED)/);
  await assert.rejects(r.request('changed-parent-setup',()=>initializeD1ImportStorage(r.context().storage.database)),/IMPORT_ATOMIC_GUARD/);
  await r.db().prepare('UPDATE ik_d1_streams SET fingerprint=? WHERE id=?').bind(origin.parent_fingerprint,job.id).run();
  await r.db().prepare('UPDATE ik_original_sets SET version=3').run();
  await r.db().prepare('DELETE FROM ik_d1_stream_pages WHERE stream_id=?').bind(job.id).run();
  await r.db().prepare('DELETE FROM ik_d1_streams WHERE id=?').bind(job.id).run();
  assert.deepEqual(await r.db().prepare('SELECT * FROM ik_d1_stream_origins').first(),origin);
  await r.reopen();
  await assert.rejects(r.request('orphan-read',()=>readD1ImportJob(origin.job_id,r.context())),/IMPORT_(?:ATOMIC_GUARD|STREAM_LAYOUT_CHANGED)/);
  await assert.rejects(r.request('orphan-setup',()=>initializeD1ImportStorage(r.context().storage.database)),/IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT version FROM ik_original_sets').first()).version,3);
  assert.equal((await r.db().prepare('SELECT count(*) n FROM contacts').first()).n,0);
  t.diagnostic(JSON.stringify(r.summary()));
});
