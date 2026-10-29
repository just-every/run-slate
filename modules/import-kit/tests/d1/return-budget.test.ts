import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { meter } from './meter.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, resumeD1Import, undoD1Import, readD1ImportJob, sha256 } from '../../src/d1/index.ts';
import { limitStatements, requestContext } from '../../src/d1/budget.ts';
import type { D1ImportContext, D1TargetAdapter } from '../../src/d1/index.ts';

// These statements execute against the real native table. Their count models an
// adapter with more native SQL per entity without changing its exact snapshots.
const nativeStatements = (count: number) => Array.from({ length: count }, () => ({ sql: 'UPDATE evidence SET detail=detail' }));
const nativeAdapter = (writeCount: number, removeCount = 0): D1TargetAdapter => ({
  ...targets,
  write(row) { return [...targets.write(row), ...nativeStatements(writeCount)]; },
  remove(...args) { return [...targets.remove(...args), ...nativeStatements(removeCount)]; },
});

for (const chunked of [false, true]) for (const action of ['apply', 'undo']) test(`real D1: explicit statement ceiling for ${action} reserves ${chunked ? 'chunked' : 'inline'} return reads before native publication`, async t => {
  const r = await runtime(t), m = meter(r.db());
  const ctx: D1ImportContext = { ...r.context(), batchSize: undefined, storage: { database: m.database, targets } };
  const bundle = source(1);
  if (chunked) {
    const bytes = Buffer.alloc(120_000, 120);
    bundle.artifacts.push({ name: 'retained.bin', sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } });
  }
  const plan = await m.request('plan', () => planD1Import(bundle, mapping, ctx));
  const create = (operationKey: string) => m.request(`create:${operationKey}`, () => createD1ImportJob(plan, { ...ctx, operationKey, reviewedFingerprint: plan.fingerprint }));
  const baseline = await create('baseline');
  assert.equal((await m.request('baseline-apply', () => applyD1ImportBatches(baseline, ctx))).state, 'completed');
  const applyCount = m.snapshots.at(-1).statements;
  assert.equal((await m.request('baseline-undo', () => undoD1Import(baseline.id, ctx))).state, 'undone');
  const undoCount = m.snapshots.at(-1).statements;

  const rejected = await create('near-limit');
  if (action === 'apply') {
    const applyContext = { ...ctx, storage: { ...ctx.storage, targets: nativeAdapter(1001 - applyCount) } };
    await assert.rejects(m.request('near-limit-apply', () => applyD1ImportBatches(rejected, limitStatements(requestContext(applyContext), 1000))), /IMPORT_D1_REQUEST_LIMIT/);
    const queued = await readD1ImportJob(rejected.id, r.context());
    assert.equal(queued.state, 'queued'); assert.equal(queued.checkpoint, 0); assert.equal(queued.fence, 0);
    for (const table of ['contacts', 'evidence']) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0);
    for (const table of ['ik_provenance', 'ik_sources', 'ik_batches', 'ik_d1_entries']) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE job_id=?`).bind(rejected.id).first())?.n, 0);
  } else {
    assert.equal((await m.request('apply-for-undo', () => applyD1ImportBatches(rejected, ctx))).state, 'completed');
    const before = await targets.read(r.db(), ctx.destination, 'contact', '0');
    const reverseContext = { ...ctx, storage: { ...ctx.storage, targets: nativeAdapter(0, 1001 - undoCount) } };
    await assert.rejects(m.request('near-limit-undo', () => undoD1Import(rejected.id, limitStatements(requestContext(reverseContext), 1000))), /IMPORT_D1_REQUEST_LIMIT/);
    const reversing = await readD1ImportJob(rejected.id, r.context());
    assert.equal(reversing.state, 'undoing'); assert.equal(reversing.checkpoint, 1); assert.equal(reversing.fence, 2);
    assert.deepEqual(await targets.read(r.db(), ctx.destination, 'contact', '0'), before);
    assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE job_id=? AND reversed=1').bind(rejected.id).first())?.n, 0);
    assert.equal((await r.db().prepare("SELECT COUNT(*) AS n FROM ik_batches WHERE job_id=? AND action='undo'").bind(rejected.id).first())?.n, 0);
    assert.equal((await m.request('resume-undo', () => resumeD1Import(rejected.id, ctx))).state, 'undone');
  }
  assert.ok(m.snapshots.every(s => s.count <= 1000));
  console.log(JSON.stringify({ returnBudget: chunked ? 'chunked' : 'inline', action, requests: m.snapshots }));
});

for (const exhaustedAt of ['preflight', 'publication']) test(`real D1: statement-bounded multi-batch resume returns durable progress when later ${exhaustedAt} exhausts its budget`, async t => {
  const r = await runtime(t), m = meter(r.db()), ctx = { ...r.context(), storage: { database: m.database, targets } };
  const plan = await m.request('plan', () => planD1Import(source(2), mapping, ctx));
  const job = await m.request('create', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }));
  const padded = nativeAdapter(700, 700);
  const expensiveRead = (secondId: string): D1TargetAdapter => ({
    ...padded,
    async read(db, destination, kind, id) {
      if (exhaustedAt === 'preflight' && id === secondId) {
        await db.batch(Array.from({ length: 400 }, () => db.prepare('SELECT detail FROM evidence WHERE id=?').bind(id)));
      }
      return targets.read(db, destination, kind, id);
    },
  });
  const partial = await m.request('multi-apply', () => resumeD1Import(job.id, limitStatements(requestContext({ ...ctx, storage: { ...ctx.storage, targets: expensiveRead('1') } }), 1000)));
  assert.equal(partial.state, 'applying'); assert.equal(partial.checkpoint, 1); assert.equal(partial.fence, 1);
  assert.deepEqual(await readD1ImportJob(job.id, r.context()), partial);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())?.n, 1);
  assert.equal((await m.request('complete-apply', () => resumeD1Import(job.id, ctx))).state, 'completed');
  const reversing = await m.request('multi-undo', () => undoD1Import(job.id, limitStatements(requestContext({ ...ctx, storage: { ...ctx.storage, targets: expensiveRead('0') } }), 1000)));
  assert.equal(reversing.state, 'undoing'); assert.equal(reversing.checkpoint, 2); assert.equal(reversing.fence, 4);
  assert.deepEqual(await readD1ImportJob(job.id, r.context()), reversing);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())?.n, 1);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE job_id=? AND reversed=1').bind(job.id).first())?.n, 1);
  assert.equal((await m.request('complete-undo', () => resumeD1Import(job.id, ctx))).state, 'undone');
  assert.ok(m.snapshots.every(s => s.count <= 1000));
  console.log(JSON.stringify({ multiBatchReturnBudget: exhaustedAt, requests: m.snapshots }));
});

test('real D1: adapter errors with a budget-shaped message still reject after progress', async t => {
  const r = await runtime(t), ctx = r.context();
  const plan = await planD1Import(source(2), mapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  const failing = (secondId: string): D1TargetAdapter => ({ ...targets, async read(db, destination, kind, id) {
    if (id === secondId) throw new Error('IMPORT_D1_REQUEST_LIMIT');
    return targets.read(db, destination, kind, id);
  } });
  await assert.rejects(resumeD1Import(job.id, { ...ctx, storage: { ...ctx.storage, targets: failing('1') } }), /IMPORT_D1_REQUEST_LIMIT/);
  assert.equal((await readD1ImportJob(job.id, ctx)).checkpoint, 1);
  assert.equal((await resumeD1Import(job.id, ctx)).state, 'completed');
  await assert.rejects(undoD1Import(job.id, { ...ctx, storage: { ...ctx.storage, targets: failing('0') } }), /IMPORT_D1_REQUEST_LIMIT/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE job_id=? AND reversed=1').bind(job.id).first())?.n, 1);
  assert.equal((await resumeD1Import(job.id, ctx)).state, 'undone');
});
