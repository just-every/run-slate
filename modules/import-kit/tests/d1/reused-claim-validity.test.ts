import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime, source} from './fixtures.ts';
import {planD1Import, createD1ImportJob, applyD1ImportBatches, undoD1Import} from '../../src/d1/index.ts';

async function partialReplay(t: any) {
  const r = await runtime(t), db = r.db(), ctx = {...r.context(), maxBatches: 1};
  const plan = await planD1Import(source(2), {version: 'v1', map: () => ({effects: []})}, ctx);
  const create = (operationKey: string) => createD1ImportJob(plan, {...ctx, operationKey, reviewedFingerprint: plan.fingerprint});
  const owner = await create('claim-owner');
  assert.equal((await applyD1ImportBatches(owner.id, ctx)).checkpoint, 1);
  assert.equal((await applyD1ImportBatches(owner.id, ctx)).state, 'completed');
  const replay = await create('claim-replay');
  assert.equal((await applyD1ImportBatches(replay.id, ctx)).checkpoint, 1);
  const unchanged = async () => {
    assert.deepEqual(await db.prepare('SELECT state,checkpoint,fence FROM ik_jobs WHERE id=?').bind(replay.id).first(), {state: 'applying', checkpoint: 1, fence: 1});
    for (const table of ['ik_d1_entries', 'ik_batches']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE job_id=?`).bind(replay.id).first())?.n, 1);
    for (const table of ['contacts', 'evidence', 'ik_d1_assertions']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0);
  };
  return {db, ctx, plan, owner, replay, unchanged};
}

const mutations = [
  ['source hash', "UPDATE ik_sources SET source_hash='changed' WHERE identity=?"],
  ['mapping version', "UPDATE ik_sources SET mapping_version='changed' WHERE identity=?"],
  ['effects hash', "UPDATE ik_sources SET effects_hash='changed' WHERE identity=?"],
  ['missing claim', 'DELETE FROM ik_sources WHERE identity=?'],
] as const;

for (const [name, mutation] of mutations) test(`real D1: previously reused zero-effect ${name} is validated before the next checkpoint`, async t => {
  const {db, ctx, plan, owner, replay, unchanged} = await partialReplay(t);
  await db.prepare(mutation).bind(plan.entries[0].identity).run();
  // The original owner and the replay must reject the same invalid custody.
  await assert.rejects(applyD1ImportBatches(owner.id, ctx), /PROVENANCE_SOURCE_CLAIM_MISMATCH/);
  await assert.rejects(applyD1ImportBatches(replay.id, ctx), /PROVENANCE_SOURCE_CLAIM_MISMATCH/);
  await unchanged();
});

test('real D1: previously reused zero-effect claim remains fenced after valid preflight', async t => {
  const {db, ctx, plan, replay, unchanged} = await partialReplay(t);
  let batches = 0;
  const database = {prepare: db.prepare.bind(db), async batch(statements: any[]) {
    if (++batches === 2) await db.prepare("UPDATE ik_sources SET source_hash='late-change' WHERE identity=?").bind(plan.entries[0].identity).run();
    return db.batch(statements);
  }};
  await assert.rejects(applyD1ImportBatches(replay.id, {...ctx, storage: {...ctx.storage, database}}), /IMPORT_ATOMIC_GUARD/);
  assert.equal(batches, 2);
  await unchanged();
});

test('real D1: validated source-only reuse and later owner undo preserve historical replay decisions', async t => {
  const {db, ctx, owner, replay} = await partialReplay(t);
  assert.equal((await applyD1ImportBatches(replay.id, ctx)).state, 'completed');
  assert.equal((await applyD1ImportBatches(replay.id, ctx)).state, 'completed');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ik_sources WHERE job_id=?').bind(owner.id).first())?.n, 2);
  assert.equal((await undoD1Import(owner.id, ctx)).state, 'undone');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ik_sources').first())?.n, 0);
  assert.equal((await applyD1ImportBatches(replay.id, ctx)).state, 'completed');
  assert.equal((await undoD1Import(replay.id, ctx)).state, 'undone');
  assert.equal((await undoD1Import(replay.id, ctx)).state, 'undone');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ik_d1_entries WHERE job_id=?').bind(replay.id).first())?.n, 2);
});
