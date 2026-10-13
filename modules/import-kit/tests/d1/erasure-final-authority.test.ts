import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteSource, sqliteMapping, sqliteTargets } from './sqlite-runtime.ts';
import {
  planD1Import, createD1ImportJob, resumeD1Import, undoD1Import,
  planD1ImportStream, prepareD1ImportStream, eraseD1ImportTarget,
  readD1ImportOriginals, readD1ImportUndoReport,
} from '../../src/d1/index.ts';

test('erasure rolls back every retained copy when assertion cleanup revokes authority', async t => {
  for (const bounded of [false, true]) await t.test(bounded ? 'bounded' : 'unbounded', async t => {
    const r = await sqliteRuntime(t);
    const context = {
      ...r.context(), reversalPolicy: 'preserve-conflicts' as const,
      originalErasurePolicy: 'withdraw-affected-artifacts' as const,
      ...(bounded ? { maxBatchBytes: 2 * 1024 * 1024 } : {}),
    };
    const source = sqliteSource(2);
    const plan = await planD1Import(source, sqliteMapping, context);
    const job = await createD1ImportJob(plan, { ...context, reviewedFingerprint: plan.fingerprint });
    await resumeD1Import(job.id, context);
    r.native().exec("UPDATE native_records SET revision='edited'");
    await undoD1Import(job.id, context);
    const report = await readD1ImportUndoReport(job.id, context);
    assert.ok(report.dispositions.length > 0);

    // A pending import retains a separate normalized copy alongside the saved
    // original and conflict report. All must share the final rollback boundary.
    const normalized = structuredClone(source);
    normalized.artifacts.forEach(artifact => artifact.original = { status: 'unavailable', reason: 'not-supplied' });
    const review = await planD1ImportStream(normalized, sqliteMapping, context);
    await prepareD1ImportStream(normalized, sqliteMapping, {
      ...context, operationKey: 'pending', reviewedFingerprint: review.fingerprint,
    });
    assert.ok(r.native().prepare('SELECT count(*) n FROM ik_d1_staging_pages').get()!.n);
    const originals = await readD1ImportOriginals(job.id, context);
    const peer = await sqliteTargets.read(r.db(), 'workspace', 'record', '1');
    assert.equal(originals[0].original.status, 'retained');
    const inventory = () => r.native().prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all().map(row => [row.name, r.native().prepare(`SELECT * FROM "${String(row.name).replaceAll('"', '""')}" ORDER BY rowid`).all()]);
    assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_assertions').get()!.n, 0);
    const before = inventory();
    r.native().exec("CREATE TRIGGER late_authority AFTER DELETE ON ik_d1_assertions BEGIN UPDATE native_authority SET enabled=0 WHERE id='owner'; END");
    await assert.rejects(eraseD1ImportTarget('record', '0', sqliteTargets.remove('workspace', 'record', '0'), context));
    assert.deepEqual(inventory(), before, 'native rows, originals, plans, reports, staging, tombstones and authority all roll back');
    assert.deepEqual(await readD1ImportOriginals(job.id, context), originals);
    assert.deepEqual(await readD1ImportUndoReport(job.id, context), report);

    r.native().exec('DROP TRIGGER late_authority');
    assert.equal((await eraseD1ImportTarget('record', '0', sqliteTargets.remove('workspace', 'record', '0'), context)).erasedRecords, 1);
    assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_assertions').get()!.n, 0);
    assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_staging').get()!.n, 0);
    assert.equal(await sqliteTargets.read(r.db(), 'workspace', 'record', '0'), undefined);
    assert.deepEqual(await sqliteTargets.read(r.db(), 'workspace', 'record', '1'), peer);
    assert.equal((await readD1ImportOriginals(job.id, context))[0].original.status, 'unavailable');
    assert.ok((await readD1ImportUndoReport(job.id, context)).dispositions.some(row => row.redacted === 'erased'));
  });
});
