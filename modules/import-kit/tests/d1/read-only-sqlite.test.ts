import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteSource, sqliteMapping } from './sqlite-runtime.ts';
import { largeReversal } from './preserved-scale-fixture.ts';
import { observeReads, publicReads, sqliteSnapshot, totalChanges } from './read-only-tools.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches } from '../../src/d1/index.ts';

for (const queryOnly of [false, true]) test(`all public D1 reads are SELECT-only on SQLite; query_only=${queryOnly}`, async t => {
  const r = await largeReversal(t, 6), native = r.native(), before = sqliteSnapshot(native), count = totalChanges(native);
  if (queryOnly) native.exec('PRAGMA query_only=ON');
  const observed = observeReads(r.db()), ctx = { ...r.context(), storage: { ...r.context().storage, database: observed.database } };
  const results = [];
  for (const read of publicReads(r.job.id, ctx)) results.push(await read());
  assert.equal((results[0] as any).id, r.job.id);
  assert.ok((results[1] as any[]).length > 0);
  assert.equal((results[2] as any).rows.length, 1);
  assert.equal((results[3] as any).total, 5);
  assert.equal((results[3] as any).dispositions.length, 1);
  assert.equal(totalChanges(native), count); assert.deepEqual(sqliteSnapshot(native), before); observed.assertSelectOnly();
});

test('denied public reads expose no private candidates and make no changes under query_only', async t => {
  const r = await largeReversal(t, 6), native = r.native();
  native.exec('UPDATE native_authority SET enabled=0');
  const count = totalChanges(native), before = sqliteSnapshot(native);
  native.exec('PRAGMA query_only=ON');
  const observed = observeReads(r.db()), ctx = { ...r.context(), storage: { ...r.context().storage, database: observed.database } };
  for (const read of publicReads(r.job.id, ctx)) {
    let delivered = false;
    await assert.rejects(read().then(value => { delivered = true; return value; }), error => {
      assert.equal((error as Error).message, 'IMPORT_ATOMIC_GUARD'); return true;
    });
    assert.equal(delivered, false);
  }
  assert.equal(totalChanges(native), count); assert.deepEqual(sqliteSnapshot(native), before); observed.assertSelectOnly();
});

test('native-trigger authority revocation still aborts the writing transaction and rolls back all effects', async t => {
  const r = await sqliteRuntime(t), native = r.native(), ctx = r.context();
  const plan = await planD1Import(sqliteSource(1, 'private-native-value'), sqliteMapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  native.exec('CREATE TRIGGER revoke_authority AFTER INSERT ON native_records BEGIN UPDATE native_authority SET enabled=0; END');
  const before = sqliteSnapshot(native);
  await assert.rejects(applyD1ImportBatches(job.id, ctx), /IMPORT_ATOMIC_GUARD/);
  assert.deepEqual(sqliteSnapshot(native), before);
});
