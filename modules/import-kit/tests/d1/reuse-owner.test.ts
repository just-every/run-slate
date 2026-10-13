import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source } from './fixtures.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, undoD1Import } from '../../src/d1/index.ts';

const mapping = { version: 'v1', map: () => ({ effects: [] }) };
async function sourceOnly(r: Awaited<ReturnType<typeof runtime>>) {
  const ctx = r.context(), plan = await planD1Import(source(1), mapping, ctx);
  const owner = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  assert.equal((await applyD1ImportBatches(owner.id, ctx)).state, 'completed');
  const replay = await createD1ImportJob(plan, { ...ctx, operationKey: 'replay', reviewedFingerprint: plan.fingerprint });
  return { ctx, plan, owner, replay };
}
async function unpublished(r: Awaited<ReturnType<typeof runtime>>, id: string) {
  const row = await r.db().prepare('SELECT state,checkpoint,fence FROM ik_jobs WHERE id=?').bind(id).first();
  assert.deepEqual(row, { state: 'queued', checkpoint: 0, fence: 0 });
  for (const table of ['ik_d1_entries', 'ik_batches', 'ik_provenance']) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE job_id=?`).bind(id).first())?.n, 0);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_assertions').first())?.n, 0);
}

test('real D1: zero-effect replay refuses a matching claim owned by an unrelated valid job', async t => {
  const r = await runtime(t), { ctx, replay } = await sourceOnly(r);
  const unrelatedPlan = await planD1Import(source(0), mapping, ctx);
  const unrelated = await createD1ImportJob(unrelatedPlan, { ...ctx, reviewedFingerprint: unrelatedPlan.fingerprint });
  assert.equal((await applyD1ImportBatches(unrelated.id, ctx)).state, 'completed');
  await r.db().prepare('UPDATE ik_sources SET job_id=?').bind(unrelated.id).run();
  await assert.rejects(applyD1ImportBatches(replay.id, ctx), /IMPORT_INVENTORY_MISMATCH/);
  await unpublished(r, replay.id);
});

test('real D1: zero-effect replay binds the claim mapping version to its owner plan', async t => {
  const r = await runtime(t), { ctx, owner, replay } = await sourceOnly(r);
  await undoD1Import(owner.id, ctx);
  const otherContext = { ...ctx, mappingVersion: 'v2' };
  const plan = await planD1Import(source(1), { ...mapping, version: 'v2' }, otherContext);
  const other = await createD1ImportJob(plan, { ...otherContext, reviewedFingerprint: plan.fingerprint });
  assert.equal((await applyD1ImportBatches(other.id, otherContext)).state, 'completed');
  await r.db().prepare("UPDATE ik_sources SET mapping_version='v1'").run();
  await assert.rejects(applyD1ImportBatches(replay.id, ctx), /IMPORT_INVENTORY_MISMATCH/);
  await unpublished(r, replay.id);
});

for (const [name, mutation] of [
  ['owner checkpoint', 'UPDATE ik_jobs SET checkpoint=0 WHERE id=?'],
  ['owner plan', "UPDATE ik_jobs SET plan_json=json_set(plan_json,'$.principalId','changed') WHERE id=?"],
  ['recorded decision', 'DELETE FROM ik_d1_entries WHERE job_id=?'],
] as const) test(`real D1: zero-effect replay atomically rejects a late ${name} change`, async t => {
  const r = await runtime(t), { ctx, owner, replay } = await sourceOnly(r), db = r.db();
  let batches = 0;
  const database = { prepare: db.prepare.bind(db), async batch(statements: any[]) {
    if (++batches === 2) await db.prepare(mutation).bind(owner.id).run();
    return db.batch(statements);
  } };
  await assert.rejects(applyD1ImportBatches(replay.id, { ...ctx, storage: { ...ctx.storage, database } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(batches, 2); await unpublished(r, replay.id);
});

test('real D1: valid zero-effect replay and undo preserve the original owner', async t => {
  const r = await runtime(t), { ctx, owner, replay } = await sourceOnly(r);
  assert.equal((await applyD1ImportBatches(replay.id, ctx)).state, 'completed');
  assert.equal((await applyD1ImportBatches(replay.id, ctx)).state, 'completed');
  assert.equal((await undoD1Import(replay.id, ctx)).state, 'undone');
  assert.equal((await r.db().prepare('SELECT job_id FROM ik_sources').first())?.job_id, owner.id);
  assert.equal((await undoD1Import(owner.id, ctx)).state, 'undone');
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_sources').first())?.n, 0);
});
