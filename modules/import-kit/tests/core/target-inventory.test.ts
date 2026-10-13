import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportBatches, createImportJob, planImport, undoImport, rollbackImport, resumeImport, readPersistedImport, reconcileImport, canonicalJson } from '../../src/index.ts';
import { nativeSetup, nativeJob, nativeSource, nativeMapping, nativeRows, snapshot } from './operation-native-fixtures.ts';

async function distinctJob(ctx, prefix) {
  const source = nativeSource();
  for (const record of source.records) record.sourceId = prefix + record.sourceId;
  const plan = planImport(source, nativeMapping, ctx);
  ctx.reviewedFingerprint = plan.fingerprint;
  return { plan, job: await createImportJob(plan, ctx) };
}

for (const terminal of ['completed', 'undone', 'rolled_back']) test(`${terminal} job refuses another real publisher's conflicting JSON target while its SQL target remains distinct`, async t => {
  const { ctx } = nativeSetup(t), first = await nativeJob(ctx);
  await applyImportBatches(first.job, ctx);
  if (terminal === 'undone') await undoImport(first.job.id, ctx);
  if (terminal === 'rolled_back') await rollbackImport(first.job.id, ctx);
  const second = await distinctJob(ctx, 'second-'); await applyImportBatches(second.job, ctx);
  ctx.reviewedFingerprint = first.plan.fingerprint;
  ctx.operationKey = 'replay'; const replay = await createImportJob(first.plan, ctx); delete ctx.operationKey;
  const db = ctx.storage.database;
  const row = db.prepare("SELECT * FROM ik_provenance WHERE job_id=? AND target_kind='article' AND target_id='second-0'").get(second.job.id);
  db.prepare('UPDATE ik_provenance SET record_json=? WHERE id=?').run(canonicalJson({ ...JSON.parse(row.record_json), targetId: '0' }), row.id);
  assert.equal(db.prepare('SELECT target_id FROM ik_provenance WHERE id=?').get(row.id).target_id, 'second-0');
  assert.equal(reconcileImport(first.plan, readPersistedImport(ctx), ctx).ok, false);
  const before = snapshot(ctx);
  for (const invoke of [
    () => resumeImport(first.job.id, ctx),
    () => createImportJob(first.plan, ctx),
    () => applyImportBatches(replay, ctx),
    () => undoImport(first.job.id, ctx),
    () => rollbackImport(first.job.id, ctx),
  ]) {
    await assert.rejects(invoke(), /PROVENANCE_STORAGE_MISMATCH/);
    assert.deepEqual(snapshot(ctx), before);
  }
  // The inventory closure must not turn independent jobs into a global outage.
  const third = await distinctJob(ctx, 'independent-');
  assert.equal((await applyImportBatches(third.job, ctx)).state, 'completed');
  assert.equal((await resumeImport(third.job.id, ctx)).state, 'completed');
  assert.equal((await undoImport(third.job.id, ctx)).state, 'undone');
  assert.deepEqual(nativeRows(ctx), before.native);
});
