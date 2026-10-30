import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { meter } from './meter.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, undoD1Import, readD1ImportJob } from '../../src/d1/index.ts';
import { limitStatements, requestContext } from '../../src/d1/budget.ts';
import type { D1ImportContext, D1TargetAdapter, ImportJob } from '../../src/d1/index.ts';

// Each entry carries more native SQL than the gather reserve, the shape of a
// large history. Every request with an explicit statement ceiling must stop and
// commit what it gathered, so the import finishes over several requests.
const nativeStatements = (count: number) => Array.from({ length: count }, () => ({ sql: 'UPDATE evidence SET detail=detail' }));
const wide: D1TargetAdapter = {
  ...targets,
  write(row) { return [...targets.write(row), ...nativeStatements(60)]; },
  remove(...args) { return [...targets.remove(...args), ...nativeStatements(60)]; },
};

async function untilDone(m: ReturnType<typeof meter>, name: string, step: () => Promise<ImportJob>, read: () => Promise<ImportJob>, final: string) {
  const progress: ImportJob[] = [];
  while (progress.at(-1)?.state !== final) {
    assert.ok(progress.length < 20, `${name} made no progress`);
    const job = await m.request(name, step);
    // Each request's progress is durable before the next request starts.
    assert.deepEqual(await read(), job);
    if (progress.length) assert.ok(job.fence > progress.at(-1)!.fence, `${name} request saved no progress`);
    progress.push(job);
  }
  return progress;
}

test('real D1: a large import applies and undoes in saved batches within an explicit request statement ceiling', async t => {
  const r = await runtime(t), m = meter(r.db());
  const ctx: D1ImportContext = { ...r.context(), batchSize: 100, maxBatches: 20, storage: { database: m.database, targets: wide } };
  const bundle = source(40);
  const plan = await m.request('plan', () => planD1Import(bundle, mapping, ctx));
  const job = await m.request('create', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }));
  const read = () => readD1ImportJob(job.id, r.context());

  const bounded = () => limitStatements(requestContext(ctx), 1000);
  const applied = await untilDone(m, 'apply', () => applyD1ImportBatches(job.id, bounded()), read, 'completed');
  const applies = m.snapshots.filter(s => s.name === 'apply');
  assert.ok(applied.length > 1, 'apply needed more than one request');
  assert.ok(applied.every((job, i) => i === 0 || job.checkpoint > applied[i - 1].checkpoint));
  assert.ok(applies.reduce((n, s) => n + s.statements, 0) > 1000, 'the import needs more than one request of statements');
  assert.ok(applies.every(s => s.statements <= 1000));
  const { results } = await r.db().prepare('SELECT c.id,c.email,e.detail FROM contacts c JOIN evidence e ON e.id=c.id ORDER BY CAST(c.id AS INTEGER)').all();
  assert.deepEqual(results.map(row => ({ email: row.email, evidence: row.detail })), bundle.records.map(record => record.payload));

  const undone = await untilDone(m, 'undo', () => undoD1Import(job.id, bounded()), read, 'undone');
  assert.ok(undone.length > 1, 'undo needed more than one request');
  assert.ok(m.snapshots.filter(s => s.name === 'undo').every(s => s.statements <= 1000));
  for (const table of ['contacts', 'evidence']) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0);
  t.diagnostic(JSON.stringify({ apply: applies.map(s => s.statements), undo: m.snapshots.filter(s => s.name === 'undo').map(s => s.statements) }));
});
