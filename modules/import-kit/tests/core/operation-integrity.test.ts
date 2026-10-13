import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportBatches, createImportJob, undoImport, rollbackImport, resumeImport, readImportJob, readImportOriginals, readPersistedImport, reconcileImport, canonicalJson } from '../../src/index.ts';
import { nativeSetup, nativeJob, nativeRows, snapshot, firstArticle } from './operation-native-fixtures.ts';

const corruptions = {
  'SQL job moved to a real queued job': (ctx, row, other) => ctx.storage.database.prepare('UPDATE ik_provenance SET job_id=? WHERE id=?').run(other.id, row.id),
  'physical record deleted': (ctx, row) => ctx.storage.database.prepare('DELETE FROM ik_provenance WHERE id=?').run(row.id),
  'JSON job changed': (ctx, row, other) => ctx.storage.database.prepare('UPDATE ik_provenance SET record_json=? WHERE id=?').run(canonicalJson({ ...JSON.parse(row.record_json), jobId: other.id }), row.id),
  'SQL reversal flag hides a record': (ctx, row) => ctx.storage.database.prepare('UPDATE ik_provenance SET reversed=1 WHERE id=?').run(row.id),
  'SQL and JSON reversal flags lack a reversal commit': (ctx, row) => ctx.storage.database.prepare('UPDATE ik_provenance SET reversed=1,record_json=? WHERE id=?').run(canonicalJson({ ...JSON.parse(row.record_json), reversed: true }), row.id)
};
for (const [action, reverse] of Object.entries({ undo: undoImport, rollback: rollbackImport })) for (const [name, corrupt] of Object.entries(corruptions)) {
  test(`${action} preflights all six native effects before any write: ${name}`, async t => {
    const { ctx } = nativeSetup(t), { plan, job } = await nativeJob(ctx); await applyImportBatches(job, ctx);
    ctx.operationKey = 'queued-other'; const other = await createImportJob(plan, ctx);
    corrupt(ctx, firstArticle(ctx), other);
    const before = snapshot(ctx), originals = readImportOriginals(job.id, ctx);
    await assert.rejects(reverse(job.id, ctx), /PROVENANCE_/);
    assert.deepEqual(snapshot(ctx), before); assert.equal(nativeRows(ctx).length, 6);
    assert.equal(readImportJob(job.id, ctx).state, 'completed');
    assert.deepEqual(readImportOriginals(job.id, ctx), originals);
  });
}
test('completed resume and completed apply validate corrupt JSON attribution without accepting completion', async t => {
  const { ctx } = nativeSetup(t), { plan, job } = await nativeJob(ctx); await applyImportBatches(job, ctx);
  ctx.operationKey = 'queued'; const other = await createImportJob(plan, ctx);
  corruptions['JSON job changed'](ctx, firstArticle(ctx), other);
  const before = snapshot(ctx);
  for (const operation of [resumeImport, applyImportBatches]) await assert.rejects(operation(job.id, ctx), /PROVENANCE_STORAGE_MISMATCH/);
  assert.deepEqual(snapshot(ctx), before);
});
test('replay refuses extra physical provenance with a reused JSON ID before advancing any checkpoint', async t => {
  const { ctx } = nativeSetup(t), { plan, job } = await nativeJob(ctx); await applyImportBatches(job, ctx);
  const row = firstArticle(ctx), db = ctx.storage.database;
  db.prepare('INSERT INTO ik_provenance(id,job_id,ordinal,effect_ordinal,source_identity,destination,target_kind,target_id,record_json) VALUES(?,?,?,?,?,?,?,?,?)').run('extra', job.id, row.ordinal, row.effect_ordinal, row.source_identity, ctx.destination, 'article', 'orphan', row.record_json);
  assert.equal(reconcileImport(plan, readPersistedImport(ctx), ctx).ok, false);
  ctx.operationKey = 'replay'; const replay = await createImportJob(plan, ctx), before = snapshot(ctx);
  await assert.rejects(applyImportBatches(replay, ctx), /PROVENANCE_/);
  assert.deepEqual(snapshot(ctx), before); assert.equal(readImportJob(replay.id, ctx).checkpoint, 0);
});
test('source-only ownership moved to an unexecuted real job cannot become valid through apply', async t => {
  const { ctx } = nativeSetup(t), { plan, job } = await nativeJob(ctx, { version: 'v1', map: () => ({ effects: [], unmapped: [{ reason: 'Unsupported native object' }] }) });
  await applyImportBatches(job, ctx); ctx.operationKey = 'queued'; const other = await createImportJob(plan, ctx);
  ctx.storage.database.prepare('UPDATE ik_sources SET job_id=?').run(other.id);
  assert.equal(reconcileImport(plan, readPersistedImport(ctx), ctx).ok, false);
  const before = snapshot(ctx);
  await assert.rejects(applyImportBatches(other, ctx), /PROVENANCE_SOURCE_CLAIM_MISMATCH/);
  assert.deepEqual(snapshot(ctx), before); assert.equal(nativeRows(ctx).length, 0);
});
test('valid replay owns no native effects; its reversal preserves the actual publishing job', async t => {
  const { ctx } = nativeSetup(t), { plan, job } = await nativeJob(ctx); await applyImportBatches(job, ctx);
  const native = nativeRows(ctx), originals = readImportOriginals(job.id, ctx);
  ctx.operationKey = 'repeat'; const replay = await createImportJob(plan, ctx); await applyImportBatches(replay, ctx);
  assert.equal((await resumeImport(replay.id, ctx)).state, 'completed');
  assert.deepEqual(nativeRows(ctx), native); assert.ok(readPersistedImport(ctx).provenance.every(p => p.jobId === job.id));
  assert.equal((await undoImport(replay.id, ctx)).state, 'undone'); assert.deepEqual(nativeRows(ctx), native);
  assert.equal(reconcileImport(plan, readPersistedImport(ctx), ctx).ok, true);
  ctx.maxBatches = 1; assert.equal((await undoImport(job.id, ctx)).state, 'undoing');
  assert.equal(nativeRows(ctx).length, 5); delete ctx.maxBatches;
  assert.equal((await resumeImport(job.id, ctx)).state, 'undone'); assert.equal((await undoImport(job.id, ctx)).state, 'undone');
  assert.equal(nativeRows(ctx).length, 0); assert.deepEqual(readImportOriginals(job.id, ctx), originals);
});
test('source-only replay, partial apply and rollback keep original publishing attribution', async t => {
  const { ctx } = nativeSetup(t), { plan, job } = await nativeJob(ctx, { version: 'v1', map: () => ({ effects: [] }) });
  ctx.maxBatches = 1; await applyImportBatches(job, ctx); delete ctx.maxBatches;
  assert.equal((await resumeImport(job.id, ctx)).state, 'completed');
  ctx.operationKey = 'source-only-repeat'; const replay = await createImportJob(plan, ctx); await applyImportBatches(replay, ctx);
  await rollbackImport(replay.id, ctx);
  assert.ok(ctx.storage.database.prepare('SELECT job_id FROM ik_sources').all().every(row => row.job_id === job.id));
  await rollbackImport(job.id, ctx); assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_sources').get().n, 0);
});
test('same-operation create cannot return a completed job with known corrupt attribution', async t => {
  const { ctx } = nativeSetup(t), { plan, job } = await nativeJob(ctx); await applyImportBatches(job, ctx);
  const row = firstArticle(ctx);
  ctx.storage.database.prepare('UPDATE ik_provenance SET record_json=? WHERE id=?').run(canonicalJson({ ...JSON.parse(row.record_json), jobId: 'corrupt-job' }), row.id);
  const before = snapshot(ctx); await assert.rejects(createImportJob(plan, ctx), /PROVENANCE_STORAGE_MISMATCH/); assert.deepEqual(snapshot(ctx), before);
});
for (const action of ['resume', 'undo'] as const) test(`${action} validates publication checkpoint and journal before using otherwise valid provenance`, async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx); await applyImportBatches(job, ctx);
  ctx.storage.database.prepare("DELETE FROM ik_batches WHERE job_id=? AND action='apply' AND position=0").run(job.id);
  const before = snapshot(ctx);
  await assert.rejects(action === 'resume' ? resumeImport(job.id, ctx) : undoImport(job.id, ctx), /PROVENANCE_CHECKPOINT_MISMATCH/);
  assert.deepEqual(snapshot(ctx), before);
});
