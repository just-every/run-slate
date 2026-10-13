import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource } from './sqlite-runtime.ts';
import { createD1ImportJob, planD1Import, createD1ImportStream, planD1ImportStream, initializeD1ImportStorage, d1LegacyStreamReceiptUpgrade, readD1ImportJob, readD1ImportStream, resumeD1ImportStream, undoD1ImportStream, eraseD1ImportTarget } from '../../src/d1/index.ts';

test('ordinary version-three original custody and live legacy streams survive additive receipt conversion', async t => {
  const r = await sqliteRuntime(t), eager = await planD1Import(sqliteSource(1), sqliteMapping, r.context());
  const ordinary = await createD1ImportJob(eager, { ...r.context(), reviewedFingerprint: eager.fingerprint });
  const source = sqliteSource(2); source.artifacts.forEach(a => { a.original = { status: 'unavailable', reason: 'not-supplied' }; });
  const plan = await planD1ImportStream(source, sqliteMapping, r.context()), stream = await createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
  r.native().prepare('UPDATE ik_original_sets SET version=3 WHERE job_id IN (SELECT job_id FROM ik_d1_stream_pages WHERE stream_id=?)').run(stream.id);
  await r.db().batch(d1LegacyStreamReceiptUpgrade.map(s => r.db().prepare(s)));
  assert.equal(r.native().prepare('SELECT version FROM ik_original_sets WHERE job_id=?').get(ordinary.id)!.version, 3);
  assert.equal(r.native().prepare('SELECT version FROM ik_original_sets WHERE job_id=?').get(stream.id)!.version, 4);
  r.reopen(); await initializeD1ImportStorage(r.db());
  assert.equal((await readD1ImportJob(ordinary.id, r.context())).id, ordinary.id);
  assert.equal((await readD1ImportStream(stream.id, r.context())).id, stream.id);
  let status = await resumeD1ImportStream(stream.id, r.context());
  while (status.state !== 'completed') status = await resumeD1ImportStream(stream.id, r.context());
  await eraseD1ImportTarget('record', '1', r.context().storage.targets.remove('workspace', 'record', '1'), r.context());
  r.reopen(); status = await undoD1ImportStream(stream.id, r.context());
  while (status.state !== 'undone') status = await undoD1ImportStream(stream.id, r.context());
  assert.equal((await undoD1ImportStream(stream.id, r.context())).state, 'undone');
  assert.equal(r.native().prepare('SELECT count(*) AS n FROM native_records').get()!.n, 0);
});

test('legacy stream evolution rejects ambiguous orphan custody without guessing from IDs', async t => {
  const r = await sqliteRuntime(t), source = sqliteSource(1); source.artifacts.forEach(a => { a.original = { status: 'unavailable', reason: 'not-supplied' }; });
  const plan = await planD1ImportStream(source, sqliteMapping, r.context()), stream = await createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
  r.native().prepare('UPDATE ik_original_sets SET version=3 WHERE job_id=?').run(stream.id);
  r.native().prepare('UPDATE ik_jobs SET reversal_policy_hash=NULL WHERE id=?').run(stream.id);
  r.native().prepare('DELETE FROM ik_d1_stream_pages WHERE stream_id=?').run(stream.id);
  r.native().prepare('DELETE FROM ik_d1_streams WHERE id=?').run(stream.id);
  await assert.rejects(readD1ImportJob(stream.id, r.context()), /IMPORT_ATOMIC_GUARD/);
  await assert.rejects(r.db().batch(d1LegacyStreamReceiptUpgrade.map(s => r.db().prepare(s))), /IMPORT_ATOMIC_GUARD/);
  assert.equal(r.native().prepare('SELECT version FROM ik_original_sets WHERE job_id=?').get(stream.id)!.version, 3);
});
