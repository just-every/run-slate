import test from 'node:test';
import { fullScale } from './scale-size.ts';
import { logicalValue } from '../helpers/logical-size.ts';
import assert from 'node:assert/strict';
import { runtime, source, mapping } from './fixtures.ts';
import { meter } from './meter.ts';
import { planD1Import, preflightD1ImportJob, createD1ImportJob, readD1ImportOriginals, sha256, PLAN_BYTES_LIMIT, PlanTooLargeError } from '../../src/d1/index.ts';

test('real D1: an original fits chunked atomic custody, with chunked-plan return reads inside the request budget', async t => {
  const r = await runtime(t), m = meter(r.db()), ctx = { ...r.context(), storage: { ...r.context().storage, database: m.database } };
  const bytes = Buffer.alloc(fullScale ? 55_570_000 : 800_000, 120), bundle = source(0);
  bundle.artifacts = [{ name: 'large.bin', sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }];
  const plan = await m.request('near-limit-plan', () => planD1Import(bundle, mapping, ctx));
  const admission = preflightD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  const job = await m.request('near-limit-create', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }));
  assert.equal(m.snapshots.at(-1).count, admission.totalExecutions, 'creation executes exactly the admitted D1 queries and return reads');
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_jobs WHERE id=?').bind(job.id).first())?.n, 1);
  assert.ok(((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_plan_chunks WHERE job_id=?').bind(job.id).first())?.n as number) > 1, 'the plan is retained in chunks');
  const [original] = await m.request('near-limit-read', () => readD1ImportOriginals(job.id, ctx));
  assert.equal(original.size, bytes.length); assert.equal(original.sha256, bundle.artifacts[0].sha256);
  assert.deepEqual(original.original, { status: 'retained', base64: (bundle.artifacts[0].original as any).base64 });
  assert.ok(m.snapshots.every(s => s.count <= 1000));
  console.log(JSON.stringify({ createBudget: m.snapshots, admission }));
});

test('real D1: an oversized logical plan is refused before encoding or database writes', async t => {
  const r = await runtime(t), m = meter(r.db()), ctx = { ...r.context(), storage: { ...r.context().storage, database: m.database } };
  const plan = await planD1Import(source(1), mapping, ctx);
  const grown = { ...plan, diagnostics: [{ severity: 'warning', code: 'size', message: 'size', details: logicalValue(BigInt(PLAN_BYTES_LIMIT)) }] };
  assert.throws(() => preflightD1ImportJob(grown, { ...ctx, reviewedFingerprint: plan.fingerprint }), /IMPORT_PLAN_TOO_LARGE/);
  await assert.rejects(m.request('over-cap-create', () => createD1ImportJob(grown, { ...ctx, reviewedFingerprint: plan.fingerprint })), (error: any) => error instanceof PlanTooLargeError);
  const { results: tables } = await r.db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ik\\_%' ESCAPE '\\'").all();
  assert.ok(tables.length >= 10);
  for (const { name } of tables as { name: string }[]) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${name}`).first())?.n, 0);
});
