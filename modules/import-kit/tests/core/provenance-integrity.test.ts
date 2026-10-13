import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, source, mapping } from './fixtures.ts';
import { planImport, createImportJob, applyImportBatches, undoImport, readPersistedImport, reconcileImport, canonicalJson } from '../../src/index.ts';
async function applied(ctx, count = 2, map = mapping) {
  const plan = planImport(source(count), map, ctx); ctx.reviewedFingerprint = plan.fingerprint;
  const job = await createImportJob(plan, ctx); await applyImportBatches(job.id, ctx); return { plan, job };
}
function independent(ctx) {
  const db = ctx.storage.database;
  return {
    rows: db.prepare('SELECT * FROM ik_targets ORDER BY kind,id').all().map(r => ({ destination: r.destination, targetKind: r.kind, targetId: r.id, value: JSON.parse(r.value_json), revision: r.revision, ...(r.attachment_json ? { attachment: JSON.parse(r.attachment_json) } : {}) })),
    provenance: db.prepare('SELECT record_json FROM ik_provenance WHERE reversed=0 ORDER BY id').all().map(r => JSON.parse(r.record_json))
  };
}
function corruptJson(ctx, mutate) {
  const row = ctx.storage.database.prepare('SELECT * FROM ik_provenance ORDER BY id LIMIT 1').get();
  const p = JSON.parse(row.record_json); mutate(p); ctx.storage.database.prepare('UPDATE ik_provenance SET record_json=? WHERE id=?').run(canonicalJson(p), row.id); return row;
}
test('nonexistent job attribution is detected in JSON readback and durable SQL crosschecks', async t => {
  const { ctx } = setup(t), { plan } = await applied(ctx);
  assert.equal(reconcileImport(plan, independent(ctx), ctx).ok, true);
  corruptJson(ctx, p => p.jobId = 'nonexistent-job');
  const readback = readPersistedImport(ctx); assert.ok(readback.integrity!.mismatched.length);
  for (const readback of [readPersistedImport(ctx), independent(ctx)]) {
    const result = reconcileImport(plan, readback, ctx); assert.equal(result.ok, false); assert.ok(result.mismatched.some(s => s.startsWith('provenance-job:')));
  }
});
test('extra physical SQL provenance with copied JSON id cannot hide behind the expected record', async t => {
  const { ctx } = setup(t), { plan, job } = await applied(ctx);
  const db = ctx.storage.database, original = db.prepare('SELECT * FROM ik_provenance ORDER BY id LIMIT 1').get();
  db.prepare('INSERT INTO ik_provenance(id,job_id,ordinal,effect_ordinal,source_identity,destination,target_kind,target_id,record_json) VALUES(?,?,?,?,?,?,?,?,?)').run('extra-physical-row', job.id, original.ordinal, original.effect_ordinal, original.source_identity, ctx.destination, original.target_kind, 'orphan-target', original.record_json);
  const readback = readPersistedImport(ctx); assert.equal(readback.provenance.length, 3); assert.ok(readback.integrity!.mismatched.length);
  for (const readback of [readPersistedImport(ctx), independent(ctx)]) {
    const result = reconcileImport(plan, readback, ctx); assert.equal(result.ok, false);
    assert.ok(result.extra.some(s => s.includes('orphan-target'))); assert.ok(result.duplicate.length);
  }
});
test('independent readback cannot substitute a different real job or reuse provenance ids on extra targets', async t => {
  const { ctx } = setup(t), { plan } = await applied(ctx);
  ctx.operationKey = 'separate'; const other = await createImportJob(plan, ctx);
  const readback = independent(ctx); readback.provenance[0].jobId = other.id;
  assert.equal(reconcileImport(plan, readback, ctx).ok, false);
  const extra = independent(ctx); extra.provenance.push({ ...extra.provenance[0], targetId: 'extra-independent-target' });
  const report = reconcileImport(plan, extra, ctx); assert.ok(report.extra.some(s => s.includes('extra-independent-target'))); assert.ok(report.duplicate.length);
  assert.equal(reconcileImport(plan, independent(ctx), ctx).ok, true);
});
test('durable source claim, source-only jobs and missing provenance are reconciled independently', async t => {
  const { ctx } = setup(t), { plan } = await applied(ctx, 1, { version: 'v1', map: () => ({ effects: [], unmapped: [{ reason: 'Unsupported source record' }] }) });
  assert.equal(reconcileImport(plan, independent(ctx), ctx).ok, true);
  ctx.storage.database.prepare('DELETE FROM ik_sources').run();
  assert.ok(reconcileImport(plan, independent(ctx), ctx).missing.some(s => s.startsWith('source:')));
});
test('SQL/JSON source, destination, ordinal, target, reversal and job-plan corruption cannot reconcile cleanly', async t => {
  const corruptions = [
    db => db.prepare("UPDATE ik_sources SET source_hash='wrong'").run(),
    db => db.prepare("UPDATE ik_provenance SET ordinal=999").run(),
    db => db.prepare("UPDATE ik_provenance SET destination='elsewhere'").run(),
    db => db.prepare("UPDATE ik_provenance SET target_id='unrelated'").run(),
    db => db.prepare("UPDATE ik_jobs SET fingerprint='wrong'").run(),
    db => db.prepare('DELETE FROM ik_provenance').run()
  ];
  for (const mutate of corruptions) {
    const { ctx } = setup(t), { plan } = await applied(ctx, 1); const before = independent(ctx); mutate(ctx.storage.database);
    assert.equal(reconcileImport(plan, before, ctx).ok, false);
    assert.equal(reconcileImport(plan, independent(ctx), ctx).ok, false);
  }
  const { ctx } = setup(t), { plan } = await applied(ctx, 1); corruptJson(ctx, p => p.reversed = true);
  assert.equal(reconcileImport(plan, independent(ctx), ctx).ok, false);
});
test('corrupt provenance cannot redirect undo or report successful source replay', async t => {
  const { ctx } = setup(t), { plan, job } = await applied(ctx, 1);
  corruptJson(ctx, p => p.jobId = 'nonexistent-job');
  await assert.rejects(undoImport(job.id, ctx), /PROVENANCE_STORAGE_MISMATCH/);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_targets').get().n, 1);
  ctx.operationKey = 'replay'; const next = await createImportJob(plan, ctx);
  await assert.rejects(applyImportBatches(next.id, ctx), /PROVENANCE_STORAGE_MISMATCH/);
  assert.equal(ctx.storage.database.prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').get(next.id).checkpoint, 0);
});
test('valid replay retains exact original job attribution, including independent readback', async t => {
  const { ctx } = setup(t), { plan, job } = await applied(ctx, 2);
  ctx.operationKey = 'same-import-again'; const next = await createImportJob(plan, ctx); await applyImportBatches(next.id, ctx);
  assert.ok(independent(ctx).provenance.every(p => p.jobId === job.id)); assert.equal(reconcileImport(plan, independent(ctx), ctx).ok, true);
});
