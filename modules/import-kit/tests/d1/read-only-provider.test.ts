import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping } from './fixtures.ts';
import { observeReads, publicReads } from './read-only-tools.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches } from '../../src/d1/index.ts';

// Actual local workerd D1 result objects (SQLite probes use array-per-statement).
// Triggers prohibit both assertion writes; instrumentation covers every SQL.
test('actual D1 public reads succeed with assertion writes prohibited; deny expired/changed actors and sessions', async t => {
  const r = await runtime(t), db = r.db(), ctx = r.context();
  const plan = await planD1Import(source(2), mapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  await applyD1ImportBatches(job.id, ctx);
  await db.batch([
    "CREATE TRIGGER prohibit_assert_insert BEFORE INSERT ON ik_d1_assertions BEGIN SELECT RAISE(ABORT,'READ_WROTE_ASSERTION'); END",
    "CREATE TRIGGER prohibit_assert_delete BEFORE DELETE ON ik_d1_assertions BEGIN SELECT RAISE(ABORT,'READ_DELETED_ASSERTION'); END",
  ].map(q => db.prepare(q)));
  const observed = observeReads(db), readCtx = { ...ctx, storage: { ...ctx.storage, database: observed.database } };
  for (const read of publicReads(job.id, readCtx)) assert.ok(await read());
  for (const mutation of ["UPDATE sessions SET enabled=0", "UPDATE sessions SET enabled=1,expires=0", "UPDATE sessions SET expires=9999999999999,actor='other'", "UPDATE sessions SET actor='owner',id='other'"]) {
    await db.prepare(mutation).run();
    for (const read of publicReads(job.id, readCtx)) await assert.rejects(read(), /IMPORT_ATOMIC_GUARD/);
  }
  observed.assertSelectOnly();
});
