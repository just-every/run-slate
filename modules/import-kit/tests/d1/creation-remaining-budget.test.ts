import test from 'node:test';
import { fullScale } from './scale-size.ts';
import assert from 'node:assert/strict';
import { runtime, source, mapping } from './fixtures.ts';
import { meter } from './meter.ts';
import { requestContext } from '../../src/d1/budget.ts';
import { planD1Import, preflightD1ImportJob, createD1ImportJob, sha256 } from '../../src/d1/index.ts';

test('real D1: remaining request budget reserves paged creation return reads before publishing', async t => {
  const r = await runtime(t), m = meter(r.db()), ctx = { ...r.context(), storage: { ...r.context().storage, database: m.database } };
  const bytes = Buffer.alloc(fullScale ? 55_570_000 : 800_000, 120), bundle = source(0);
  bundle.artifacts = [{ name: 'large.bin', sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }];
  const plan = await m.request('remaining-budget-plan', () => planD1Import(bundle, mapping, ctx));
  const reviewed = { ...ctx, reviewedFingerprint: plan.fingerprint }, admission = preflightD1ImportJob(plan, reviewed);
  // Model an outer invocation with real already-executed D1 work. Reusing its
  // request context is the same mechanism used by nested public resume calls.
  // No fake provider limit or special artifact-size cutoff is introduced.
  const invocation = requestContext(reviewed);
  await assert.rejects(m.request('remaining-budget-create', async () => {
    for (let n = 0; n < 1001 - admission.totalExecutions; n++) await invocation.storage.database.prepare('SELECT 1').first();
    return createD1ImportJob(plan, invocation);
  }), /IMPORT_D1_REQUEST_LIMIT/);
  const executed = m.snapshots.at(-1).count;
  assert.ok(executed + admission.mutationExecutions <= 1000, 'mutation itself would fit');
  for (const table of ['ik_jobs', 'ik_d1_plan_chunks', 'ik_original_sets', 'ik_originals', 'ik_d1_original_chunks', 'ik_d1_assertions']) {
    assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0, `${table} must remain empty`);
  }
  assert.ok(m.snapshots.every(s => s.count <= 1000));
  console.log(JSON.stringify({ remainingCreationBudget: m.snapshots, admission }));
});
