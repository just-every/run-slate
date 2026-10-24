import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource, sqliteTargets } from './sqlite-runtime.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, undoD1Import, resumeD1Import, rollbackD1Import, readD1ImportUndoReport, readD1PersistedImport, readD1ImportOriginals, canonicalJson } from '../../src/d1/index.ts';
import type { D1ImportContext } from '../../src/d1/index.ts';
async function applied(r: Awaited<ReturnType<typeof sqliteRuntime>>, count: number, extra: Partial<D1ImportContext> = {}) {
  const ctx = { ...r.context(), reversalPolicy: 'preserve-conflicts' as const, ...extra };
  const plan = await planD1Import(sqliteSource(count), sqliteMapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  await applyD1ImportBatches(job.id, ctx);
  return job;
}
for (const batchSize of [1, 4, 20]) for (const count of [0, 3, 25]) test(`preserved undo bounded progress and restart: effects=${count}, batch=${batchSize}`, async t => {
  const r = await sqliteRuntime(t), job = await applied(r, count);
  const before = r.native().prepare('SELECT * FROM ik_provenance ORDER BY id').all();
  if (count) r.native().prepare('UPDATE native_records SET value_json=? WHERE id=?').run(canonicalJson({ id: '0', label: 'edited without revision' }), '0');
  let current = await undoD1Import(job.id, { ...r.context(), batchSize, maxBatches: 1 });
  let report = await readD1ImportUndoReport(job.id, r.context());
  assert.ok(report.cursor <= batchSize);
  while (current.state !== 'undone') {
    const cursor = report.cursor; r.reopen();
    current = await resumeD1Import(job.id, { ...r.context(), batchSize, maxBatches: 1 });
    report = await readD1ImportUndoReport(job.id, r.context());
    assert.ok(report.cursor > cursor && report.cursor - cursor <= batchSize);
  }
  assert.equal(report.cursor, count);
  assert.equal(report.outcome, count ? 'compensated' : 'undone');
  assert.equal(report.dispositions.filter(d => d.disposition === 'retained').length, Number(count > 0));
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM native_records').get()!.n, Number(count > 0));
  if (count) {
    const retained = report.dispositions.find(d => d.disposition === 'retained')!;
    assert.equal(retained.reason, 'edited');
    assert.deepEqual(r.native().prepare('SELECT * FROM ik_provenance WHERE id=?').get(retained.effectId), before.find(p => p.id === retained.effectId));
    assert.equal((await readD1PersistedImport(r.context())).provenance.length, 1);
  }
  r.reopen();
  assert.deepEqual(await readD1ImportUndoReport(job.id, r.context()), report);
  assert.equal((await undoD1Import(job.id, r.context())).state, 'undone');
  assert.equal((await readD1ImportOriginals(job.id, r.context())).length, 1);
  await assert.rejects(rollbackD1Import(job.id, r.context()), /REVERSAL_MODE_CONFLICT/);
});
test('all conflicts complete; strict policy cannot switch and still rejects native edits', async t => {
  const r = await sqliteRuntime(t), job = await applied(r, 4);
  r.native().exec("UPDATE native_records SET revision='changed'");
  assert.equal((await undoD1Import(job.id, r.context())).state, 'undone');
  const report = await readD1ImportUndoReport(job.id, r.context());
  assert.equal(report.cursor, 4); assert.ok(report.dispositions.every(d => d.reason === 'edited'));
  await assert.rejects(undoD1Import(job.id, { ...r.context(), reversalPolicy: 'strict' }), /REVERSAL_POLICY_CONFLICT/);
  const r2 = await sqliteRuntime(t), strict = await applied(r2, 1, { reversalPolicy: undefined });
  r2.native().exec("UPDATE native_records SET revision='changed'");
  await assert.rejects(undoD1Import(strict.id, { ...r2.context(), reversalPolicy: 'preserve-conflicts' }), /REVERSAL_POLICY_CONFLICT/);
  await assert.rejects(undoD1Import(strict.id, r2.context()), /NATIVE_EDIT_CONFLICT/);
});
test('conflict-only publication rechecks current authority and rolls back reports and fence', async t => {
  const r = await sqliteRuntime(t), job = await applied(r, 2);
  r.native().exec("UPDATE native_records SET revision='edited'");
  const adapter = { ...sqliteTargets, async preparePreservedUndo(...args: Parameters<NonNullable<typeof sqliteTargets.preparePreservedUndo>>) {
    const snapshot = await sqliteTargets.preparePreservedUndo!(...args);
    r.native().exec("UPDATE native_authority SET enabled=0");
    return snapshot;
  } };
  await assert.rejects(undoD1Import(job.id, { ...r.context(), storage: { database: r.db(), targets: adapter } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(r.native().prepare('SELECT reversal_cursor AS n FROM ik_jobs WHERE id=?').get(job.id)!.n, 0);
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_d1_reversal_reports').get()!.n, 0);
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE reversed=0').get()!.n, 2);
});
for (const tamper of ["UPDATE ik_d1_reversal_reports SET record_json='{}'", 'DELETE FROM ik_d1_reversal_reports', "UPDATE ik_sources SET source_hash='forged'", "UPDATE ik_provenance SET record_json='{}'", 'DELETE FROM ik_originals']) test(`retained audit custody is integrity checked: ${tamper}`, async t => {
  const r = await sqliteRuntime(t), job = await applied(r, 1);
  r.native().exec("UPDATE native_records SET revision='edited'"); await undoD1Import(job.id, r.context());
  r.native().exec(tamper);
  await assert.rejects(readD1ImportUndoReport(job.id, r.context()), /IMPORT_REVERSAL_INTEGRITY|PROVENANCE_|ORIGINAL_CUSTODY/);
  await assert.rejects(undoD1Import(job.id, r.context()), /IMPORT_REVERSAL_INTEGRITY|PROVENANCE_|ORIGINAL_CUSTODY/);
});
test('report pages cover the same durable closure and policy tampering fails closed', async t => {
  const r = await sqliteRuntime(t), job = await applied(r, 5);
  await undoD1Import(job.id, r.context());
  const first = await readD1ImportUndoReport(job.id, r.context(), { limit: 2 });
  const second = await readD1ImportUndoReport(job.id, r.context(), { offset: first.nextOffset!, limit: 2 });
  const third = await readD1ImportUndoReport(job.id, r.context(), { offset: second.nextOffset!, limit: 2 });
  assert.equal(first.total, 5); assert.equal(third.nextOffset, null);
  assert.equal(new Set([...first.dispositions, ...second.dispositions, ...third.dispositions].map(d => d.effectId)).size, 5);
  r.native().exec("UPDATE ik_jobs SET reversal_policy='strict'");
  await assert.rejects(readD1ImportUndoReport(job.id, r.context()), /IMPORT_REVERSAL_INTEGRITY/);
});
test('removed reversal progress journal cannot be mistaken for a completed report', async t => {
  const r = await sqliteRuntime(t), job = await applied(r, 3);
  await undoD1Import(job.id, r.context());
  r.native().exec("DELETE FROM ik_batches WHERE action='undo'");
  await assert.rejects(readD1ImportUndoReport(job.id, r.context()), /IMPORT_JOURNAL_MISMATCH/);
  await assert.rejects(undoD1Import(job.id, r.context()), /IMPORT_JOURNAL_MISMATCH/);
});
for (const edited of [false, true]) test(`partial preserved rollback retains custody and reports committed effects (edited=${edited})`, async t => {
  const r = await sqliteRuntime(t), ctx = { ...r.context(), reversalPolicy: 'preserve-conflicts' as const, batchSize: 2, maxBatches: 1 };
  const plan = await planD1Import(sqliteSource(5), sqliteMapping, ctx), job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  assert.equal((await applyD1ImportBatches(job.id, ctx)).checkpoint, 2);
  if (edited) r.native().exec("UPDATE native_records SET revision='native-edit' WHERE id='0'");
  let current = await rollbackD1Import(job.id, { ...ctx, batchSize: 1 });
  assert.equal(current.state, 'rolling_back');
  await assert.rejects(undoD1Import(job.id, r.context()), /REVERSAL_MODE_CONFLICT/);
  r.reopen();
  current = await resumeD1Import(job.id, r.context());
  assert.equal(current.state, 'rolled_back');
  const report = await readD1ImportUndoReport(job.id, r.context());
  assert.equal(report.cursor, 2); assert.equal(report.dispositions.filter(d => d.disposition === 'retained').length, Number(edited));
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM native_records').get()!.n, Number(edited));
  assert.equal((await readD1ImportOriginals(job.id, r.context())).length, 1);
  assert.equal((await rollbackD1Import(job.id, r.context())).state, 'rolled_back');
});
