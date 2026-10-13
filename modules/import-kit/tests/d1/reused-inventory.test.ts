import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source } from './fixtures.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, undoD1Import } from '../../src/d1/index.ts';

const mapping = { version: 'v1', map: () => ({ effects: [] }) };
const additions = [
  { table: 'ik_provenance', insert: "INSERT INTO ik_provenance(id,job_id,ordinal,effect_ordinal,source_identity,destination,target_kind,target_id,record_json) VALUES('rogue',?,2,0,'rogue-source','workspace','contact','rogue','{}')", earlyError: /PROVENANCE_STORAGE_MISMATCH/ },
  { table: 'ik_d1_history', insert: "INSERT INTO ik_d1_history(id,job_id,ordinal,effect_ordinal,source_identity,destination,target_kind,target_id,reversed,record_json,successor_id) VALUES('rogue',?,2,0,'rogue-source','workspace','contact','rogue',0,'{}','rogue-successor')", earlyError: /PROVENANCE_STORAGE_MISMATCH/ },
  { table: 'ik_d1_entries', insert: "INSERT INTO ik_d1_entries(job_id,ordinal,source_identity,owner_job_id,effects_hash) SELECT id,2,'rogue-source',id,'rogue' FROM ik_jobs WHERE id=?" },
  { table: 'ik_sources', insert: "INSERT INTO ik_sources(identity,source_hash,mapping_version,effects_hash,job_id) VALUES('rogue-source','rogue','v1','rogue',?)" },
];

for (const addition of additions) test(`real D1: reused owner ${addition.table} additions invalidate the complete selected set`, async t => {
  const r = await runtime(t), ctx = { ...r.context(), maxBatches: 1 }, db = r.db();
  const plan = await planD1Import(source(2), mapping, ctx);
  const create = (operationKey: string) => createD1ImportJob(plan, { ...ctx, operationKey, reviewedFingerprint: plan.fingerprint });
  const owner = await create('owner');
  assert.equal((await applyD1ImportBatches(owner.id, ctx)).checkpoint, 1);
  assert.equal((await applyD1ImportBatches(owner.id, ctx)).state, 'completed');

  // The same valid source-only inventory is reusable across both checkpoints.
  const control = await create('control');
  assert.equal((await applyD1ImportBatches(control.id, ctx)).checkpoint, 1);
  assert.equal((await applyD1ImportBatches(control.id, ctx)).state, 'completed');
  const replay = await create('replay');
  const partial = await applyD1ImportBatches(replay.id, ctx);
  assert.equal(partial.checkpoint, 1);
  const rogueScope = addition.table === 'ik_sources' ? "identity='rogue-source'" : 'ordinal=2';
  const unchanged = async () => {
    assert.deepEqual(await db.prepare('SELECT state,checkpoint,fence FROM ik_jobs WHERE id=?').bind(replay.id).first(), { state: 'applying', checkpoint: 1, fence: 1 });
    for (const table of ['ik_d1_entries', 'ik_batches']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE job_id=?`).bind(replay.id).first())?.n, 1);
    for (const table of ['contacts', 'evidence', 'ik_d1_assertions']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM ik_sources WHERE job_id=? AND identity<>'rogue-source'").bind(owner.id).first())?.n, 2);
  };
  if (addition.earlyError) {
    await db.prepare(addition.insert).bind(owner.id).run();
    await assert.rejects(applyD1ImportBatches(replay.id, ctx), addition.earlyError);
    await unchanged();
    await db.prepare(`DELETE FROM ${addition.table} WHERE job_id=? AND ${rogueScope}`).bind(owner.id).run();
  }
  let batches = 0;
  const database = { prepare: db.prepare.bind(db), async batch(statements: any[]) {
    // Authorization is the first batch; mutate after every publication preflight.
    if (++batches === 2) await db.prepare(addition.insert).bind(owner.id).run();
    return db.batch(statements);
  } };
  await assert.rejects(applyD1ImportBatches(replay.id, { ...ctx, storage: { ...ctx.storage, database } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(batches, 2); await unchanged();
  assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${addition.table} WHERE job_id=? AND ${rogueScope}`).bind(owner.id).first())?.n, 1);
  await db.prepare(`DELETE FROM ${addition.table} WHERE job_id=? AND ${rogueScope}`).bind(owner.id).run();
  assert.equal((await applyD1ImportBatches(replay.id, ctx)).state, 'completed');
  assert.equal((await undoD1Import(replay.id, ctx)).state, 'undone');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ik_sources WHERE job_id=?').bind(owner.id).first())?.n, 2);
});
