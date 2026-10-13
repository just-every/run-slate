import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteSource, sqliteMapping } from './sqlite-runtime.ts';
import { observeReads, sqliteSnapshot, totalChanges } from './read-only-tools.ts';
import { planD1ImportStream, createD1ImportStream, readD1ImportStream, resumeD1ImportStream, undoD1ImportStream } from '../../src/d1/index.ts';

// A distinct public lifecycle: stream status needs no write capability, while
// each lifecycle operation and its eventual result use that operation's grant.
test('stream status is read-only and stream lifecycle results retain current action authority', async t => {
  const r = await sqliteRuntime(t), native = r.native(), source = sqliteSource(2);
  source.artifacts.forEach(artifact => { artifact.original = { status: 'unavailable', reason: 'not-supplied' }; });
  const plan = await planD1ImportStream(source, sqliteMapping, r.context());
  native.exec("CREATE TABLE stream_grants(action TEXT PRIMARY KEY); INSERT INTO stream_grants VALUES('create')");
  const context = () => ({ ...r.context(), maxBatchBytes: 2 * 1024 * 1024, authorization: {
    principalId: 'owner', predicate(action: any, destination: string) {
      const current = r.context().authorization.predicate(action, destination);
      return { sql: `(${current.sql}) AND EXISTS(SELECT 1 FROM stream_grants WHERE action=?)`, params: [...current.params ?? [], action] };
    },
  } });
  const job = await createD1ImportStream(plan, { ...context(), reviewedFingerprint: plan.fingerprint });
  await assert.rejects(readD1ImportStream(job.id, context()), /IMPORT_ATOMIC_GUARD/);
  native.exec("DELETE FROM stream_grants; INSERT INTO stream_grants VALUES('read')");
  const before = sqliteSnapshot(native), count = totalChanges(native), observed = observeReads(r.db());
  native.exec('PRAGMA query_only=ON');
  const status = await readD1ImportStream(job.id, { ...context(), storage: { ...context().storage, database: observed.database } });
  assert.equal(status.total, 2); assert.equal(status.checkpoint, 0);
  assert.equal(totalChanges(native), count); assert.deepEqual(sqliteSnapshot(native), before);
  observed.assertSelectOnly();
  native.exec("PRAGMA query_only=OFF; DELETE FROM stream_grants; INSERT INTO stream_grants VALUES('apply')");
  assert.equal((await resumeD1ImportStream(job.id, context())).state, 'completed');
  assert.equal(native.prepare('SELECT count(*) AS n FROM native_records').get()!.n, 2);
  await assert.rejects(readD1ImportStream(job.id, context()), /IMPORT_ATOMIC_GUARD/);
  native.exec("DELETE FROM stream_grants; INSERT INTO stream_grants VALUES('undo')");
  assert.equal((await undoD1ImportStream(job.id, context())).state, 'undone');
  assert.equal(native.prepare('SELECT count(*) AS n FROM native_records').get()!.n, 0);
});
