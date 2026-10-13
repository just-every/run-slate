import test from 'node:test';
import assert from 'node:assert/strict';
import { planD1Import, createD1ImportJob, resumeD1Import, undoD1Import, readD1PersistedImport, readD1ImportJob, eraseD1ImportTarget, upgradeD1ImportErasureIndex, d1ErasureSchema, canonicalJson, sha256 } from '../../src/d1/index.ts';
import type { D1Database } from '../../src/d1/index.ts';
import { runtime, source, mapping, targets } from './fixtures.ts';

function normalized(large = false) {
  const bundle = source(3);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  if (large) {
    bundle.records[0].payload = { email: 'person0@example.test', evidence: 'private-long-answer-'.repeat(10000) };
    bundle.records[0].payloadHash = sha256(canonicalJson(bundle.records[0].payload));
  }
  bundle.diagnostics.push({ severity: 'warning', code: 'SOURCE_NOTE', message: 'person0@example.test', kind: 'contact', sourceId: '0' });
  return bundle;
}
async function retained(db: D1Database) {
  const names = ['ik_jobs', 'ik_d1_plan_chunks', 'ik_provenance', 'ik_d1_history', 'ik_sources', 'ik_d1_entries', 'ik_originals', 'ik_d1_original_chunks', 'ik_stages', 'contacts', 'evidence'];
  return JSON.stringify(await Promise.all(names.map(async name => (await db.prepare(`SELECT * FROM ${name}`).all()).results)));
}
async function create(r: Awaited<ReturnType<typeof runtime>>, large = false) {
  const plan = await planD1Import(normalized(large), mapping, r.context());
  const job = await createD1ImportJob(plan, { ...r.context(), operationKey: 'original-file', reviewedFingerprint: plan.fingerprint });
  return { plan, job };
}
const erase = (r: Awaited<ReturnType<typeof runtime>>, id = '0') => eraseD1ImportTarget('contact', id, targets.remove('workspace', 'contact', id), r.context());

for (const partial of [false, true]) test(`real D1: erasure removes normalized ${partial ? 'partially applied chunked' : 'completed'} custody, preserves peers and survives reopen/replay/undo`, async t => {
  const r = await runtime(t), { plan, job } = await create(r, partial);
  const published = await resumeD1Import(job.id, { ...r.context(), ...(partial ? { maxBatches: 1 } : {}) });
  assert.equal(published.state, partial ? 'applying' : 'completed');
  if (partial) assert.ok((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_plan_chunks').first())!.n > 0);
  assert.equal((await erase(r)).erasedRecords, 1);
  assert.equal((await readD1ImportJob(job.id, r.context())).erasedRecords, 1);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test|private-long-answer-/);
  assert.match(await retained(r.db()), /person1@example\.test/);
  await r.reopen();
  assert.equal((await resumeD1Import(job.id, r.context())).state, 'completed');
  assert.equal((await targets.list(r.db(), 'workspace')).length, 2);
  assert.equal((await readD1PersistedImport(r.context())).provenance.length, 2);
  assert.equal((await createD1ImportJob(plan, { ...r.context(), operationKey: 'original-file', reviewedFingerprint: plan.fingerprint })).id, job.id);
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'new-key', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  assert.equal((await undoD1Import(job.id, r.context())).state, 'undone');
  assert.equal((await undoD1Import(job.id, r.context())).state, 'undone');
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'after-undo', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test|private-long-answer-/);
  assert.equal((await targets.list(r.db(), 'workspace')).length, 0);
});

test('real D1: erasure is atomic with native statements, current authority and exact postconditions', async t => {
  const r = await runtime(t), { job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const before = await retained(r.db());
  for (const extra of [{ sql: 'UPDATE sessions SET enabled=0' }, { sql: 'INSERT INTO missing_table VALUES(1)' }]) {
    await assert.rejects(eraseD1ImportTarget('contact', '0', [...targets.remove('workspace', 'contact', '0'), extra], r.context()));
    assert.equal(await retained(r.db()), before);
  }
  await assert.rejects(eraseD1ImportTarget('contact', '0', [], r.context()), /IMPORT_ATOMIC_GUARD/);
  assert.equal(await retained(r.db()), before);
  await r.db().prepare("UPDATE evidence SET detail='later unrelated edit' WHERE id='1'").run();
  await erase(r);
  await assert.rejects(undoD1Import(job.id, r.context()), /NATIVE_EDIT_CONFLICT/);
  assert.equal((await r.db().prepare("SELECT detail FROM evidence WHERE id='1'").first())?.detail, 'later unrelated edit');
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

test('real D1: erased source reuse reconciles original, reused and previously reversed jobs', async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  await resumeD1Import(job.id, r.context()); await undoD1Import(job.id, r.context());
  const next = await createD1ImportJob(plan, { ...r.context(), operationKey: 'second', reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(next.id, r.context());
  const reused = await createD1ImportJob(plan, { ...r.context(), operationKey: 'third', reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(reused.id, r.context());
  assert.equal((await erase(r)).erasedRecords, 3);
  assert.equal((await undoD1Import(job.id, r.context())).state, 'undone');
  assert.equal((await undoD1Import(reused.id, r.context())).state, 'undone');
  assert.equal((await undoD1Import(next.id, r.context())).state, 'undone');
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

test('real D1: an apply prepared before erasure loses its atomic boundary and cannot resurrect data', async t => {
  const r = await runtime(t), { job } = await create(r);
  await resumeD1Import(job.id, { ...r.context(), maxBatches: 1 });
  const ctx = r.context(); let erased = false;
  const racing: D1Database = { prepare: query => ctx.storage.database.prepare(query), async batch(statements) {
    if (!erased && statements.length > 2) { erased = true; await erase(r); }
    return ctx.storage.database.batch(statements);
  } };
  await assert.rejects(resumeD1Import(job.id, { ...ctx, storage: { ...ctx.storage, database: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await readD1ImportJob(job.id, r.context())).checkpoint, 1);
  assert.equal((await resumeD1Import(job.id, r.context())).state, 'completed');
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

test('real D1: a create prepared before erasure cannot retain an obsolete private plan', async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const ctx = r.context(); let erased = false;
  const racing: D1Database = { prepare: query => ctx.storage.database.prepare(query), async batch(statements) {
    if (!erased && statements.length > 2) { erased = true; await erase(r); }
    return ctx.storage.database.batch(statements);
  } };
  await assert.rejects(createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint, operationKey: 'racing-new-job', storage: { ...ctx.storage, database: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_jobs').first())?.n, 1);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

test('real D1: unsupported retained artifacts fail before native erasure or plan changes', async t => {
  const r = await runtime(t), plan = await planD1Import(source(1), mapping, r.context());
  const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(job.id, r.context());
  const before = await retained(r.db());
  await assert.rejects(erase(r), /IMPORT_ERASURE_RETAINED_ORIGINAL/);
  assert.equal(await retained(r.db()), before);
});

for (const partial of [false, true]) test(`real D1: additive erasure index upgrades prior ${partial ? 'partial chunked' : 'completed inline'} jobs without changing their plans`, async t => {
  const r = await runtime(t), { plan, job } = await create(r, partial);
  await resumeD1Import(job.id, { ...r.context(), ...(partial ? { maxBatches: 1 } : {}) });
  const before = await r.db().prepare('SELECT plan_json,fingerprint FROM ik_jobs WHERE id=?').bind(job.id).first();
  // Reproduce an installation before the additive schema: all original kit,
  // native rows and chunks remain exactly as the prior APIs stored them.
  await r.db().batch(['ik_d1_plan_index', 'ik_d1_indexed_jobs', 'ik_d1_erased_sources', 'ik_d1_erased_targets'].map(table => r.db().prepare(`DROP TABLE ${table}`)));
  await r.db().batch(d1ErasureSchema.map(statement => r.db().prepare(statement)));
  await assert.rejects(erase(r), /IMPORT_ERASURE_INDEX_UPGRADE_REQUIRED/);
  assert.ok(await targets.read(r.db(), 'workspace', 'contact', '0'));
  assert.deepEqual(await upgradeD1ImportErasureIndex(r.context(), 1), { indexed: 1, complete: true });
  assert.deepEqual(await r.db().prepare('SELECT plan_json,fingerprint FROM ik_jobs WHERE id=?').bind(job.id).first(), before);
  assert.deepEqual(await upgradeD1ImportErasureIndex(r.context()), { indexed: 0, complete: true });
  await erase(r);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test|private-long-answer-/);
  await resumeD1Import(job.id, r.context());
  assert.equal((await createD1ImportJob(plan, { ...r.context(), operationKey: 'original-file', reviewedFingerprint: plan.fingerprint })).id, job.id);
  await undoD1Import(job.id, r.context());
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'after-upgrade', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
});

test('real D1: erasure reconciles completed reused plans within one request and does not load unrelated plans', async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const copies = [job.id];
  const count = process.env.IMPORT_KIT_SCALE === '1' ? 50 : 3;
  for (let n = 1; n < count; n++) {
    const copy = await createD1ImportJob(plan, { ...r.context(), operationKey: `copy-${n}`, reviewedFingerprint: plan.fingerprint });
    await resumeD1Import(copy.id, { ...r.context(), batchSize: 100 }); copies.push(copy.id);
  }
  const unrelated = normalized();
  for (const record of unrelated.records) record.sourceId = `other-${record.sourceId}`;
  const otherPlan = await planD1Import(unrelated, mapping, r.context());
  const other = await createD1ImportJob(otherPlan, { ...r.context(), operationKey: 'unrelated', reviewedFingerprint: otherPlan.fingerprint });
  await resumeD1Import(other.id, r.context());
  // A wholly unrelated retained plan is not read during this erase. Its exact
  // row stays intact; ordinary operations on that job still validate its body.
  const untouched = await r.db().prepare('SELECT * FROM ik_jobs WHERE id=?').bind(other.id).first();
  assert.equal((await erase(r)).erasedRecords, copies.length);
  assert.deepEqual(await r.db().prepare('SELECT * FROM ik_jobs WHERE id=?').bind(other.id).first(), untouched);
  for (const id of copies) assert.equal((await readD1ImportJob(id, r.context())).erasedRecords, 1);
  assert.equal((await readD1PersistedImport(r.context())).provenance.filter(row => row.targetId === '0').length, 0);
  await undoD1Import(copies.at(-1)!, r.context());
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'after-many-copies', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  assert.equal((await targets.list(r.db(), 'workspace')).length, 5);
});

test('real D1: erasure removes a queued different-source plan targeting the same native entity', async t => {
  const r = await runtime(t), { job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const other = normalized(); other.records[0].sourceId = 'other-source';
  const remap = { version: 'v1', map: (record: any) => ({ effects: [{ targetKind: 'contact', targetId: record.sourceId === 'other-source' ? '0' : record.sourceId, value: record.payload }] }) };
  const plan = await planD1Import(other, remap, r.context());
  const queued = await createD1ImportJob(plan, { ...r.context(), operationKey: 'pending-replacement', reviewedFingerprint: plan.fingerprint });
  assert.equal((await erase(r)).erasedRecords, 2);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
  await resumeD1Import(queued.id, r.context());
  assert.equal(await targets.read(r.db(), 'workspace', 'contact', '0'), undefined);
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'new-source-after-erase', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
});

test('real D1: index upgrades fence the exact prior plan and current session', async t => {
  const r = await runtime(t), { job } = await create(r);
  await r.db().prepare('DELETE FROM ik_d1_plan_index WHERE job_id=?').bind(job.id).run();
  await r.db().prepare('DELETE FROM ik_d1_indexed_jobs WHERE job_id=?').bind(job.id).run();
  const ctx = r.context(); let changed = false;
  const racing: D1Database = { prepare: query => ctx.storage.database.prepare(query), async batch(statements) {
    if (!changed && statements.length > 2) {
      changed = true;
      await r.db().prepare("UPDATE ik_jobs SET error='changed during upgrade' WHERE id=?").bind(job.id).run();
    }
    return ctx.storage.database.batch(statements);
  } };
  await assert.rejects(upgradeD1ImportErasureIndex({ ...ctx, storage: { ...ctx.storage, database: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_d1_indexed_jobs').first())?.n, 0);
  await r.db().prepare('UPDATE sessions SET enabled=0').run();
  await assert.rejects(upgradeD1ImportErasureIndex(r.context()), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_d1_plan_index').first())?.n, 0);
  await r.db().prepare('UPDATE sessions SET enabled=1').run();
  assert.deepEqual(await upgradeD1ImportErasureIndex(r.context()), { indexed: 1, complete: true });
});

for (const mutation of ['DELETE FROM ik_d1_plan_index WHERE job_id=? AND ordinal=0', "UPDATE ik_d1_plan_index SET target_identity='corrupt' WHERE job_id=? AND ordinal=0"]) test('real D1: changed or missing derived rows invalidate index completeness before erasure', async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const pending = await createD1ImportJob(plan, { ...r.context(), operationKey: 'queued-copy', reviewedFingerprint: plan.fingerprint });
  await r.db().prepare(mutation).bind(pending.id).run();
  assert.equal(await r.db().prepare('SELECT * FROM ik_d1_indexed_jobs WHERE job_id=?').bind(pending.id).first(), null);
  const before = await retained(r.db());
  await assert.rejects(erase(r), /IMPORT_ERASURE_INDEX_UPGRADE_REQUIRED/);
  assert.equal(await retained(r.db()), before);
  assert.deepEqual(await upgradeD1ImportErasureIndex(r.context()), { indexed: 1, complete: true });
  assert.equal((await erase(r)).erasedRecords, 2);
  await undoD1Import(job.id, r.context());
  await resumeD1Import(pending.id, r.context());
  assert.equal(await targets.read(r.db(), 'workspace', 'contact', '0'), undefined);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

for (const tombstone of ['source', 'target']) test(`real D1: every retained replay independently refuses an erased ${tombstone}`, async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  const identity = tombstone === 'source' ? plan.entries[0].identity : sha256(canonicalJson(['workspace', 'contact', '0']));
  await r.db().prepare(`INSERT INTO ik_d1_erased_${tombstone}s(destination,identity) VALUES(?,?)`).bind('workspace', identity).run();
  await assert.rejects(resumeD1Import(job.id, r.context()), /IMPORT_SOURCE_ERASED/);
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'original-file', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  await assert.rejects(upgradeD1ImportErasureIndex(r.context()).then(async () => {
    await r.db().prepare('DELETE FROM ik_d1_indexed_jobs WHERE job_id=?').bind(job.id).run();
    await upgradeD1ImportErasureIndex(r.context());
  }), /IMPORT_SOURCE_ERASED/);
  assert.equal((await targets.list(r.db(), 'workspace')).length, 0);
});
