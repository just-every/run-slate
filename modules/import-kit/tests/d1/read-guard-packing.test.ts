import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime } from './sqlite-runtime.ts';
import { runtime } from './fixtures.ts';
import { readAtomic, guard, sql } from '../../src/d1/database.ts';
import { packGuards, requestContext } from '../../src/d1/budget.ts';
import { observeReads, totalChanges } from './read-only-tools.ts';

for (const [name, setup] of [['SQLite', sqliteRuntime], ['actual D1', runtime]] as const) test(`${name}: every packed scalar is checked, preserving SQL and parameter ordering`, async t => {
  const r = await setup(t), db = r.db();
  const observed = observeReads(db), ctx = { ...r.context(), storage: { ...r.context().storage, database: observed.database } };
  // Each uses a subquery, JSON path, quote and three binds, forcing a bind split
  // before the 50-predicate split. The final group must never be ignored.
  const guards = Array.from({ length: 121 }, (_, i) => guard(sql("(SELECT json_extract(?, '$.value'))=? AND ?='it''s scalar'", JSON.stringify({ value: i }), i, "it's scalar")));
  assert.ok(packGuards(guards, true).length >= 4);
  await readAtomic(ctx, guards);
  for (const falsePredicate of ['0', 'NULL']) await assert.rejects(readAtomic(ctx, [...guards, guard(sql(falsePredicate))]), /^Error: IMPORT_ATOMIC_GUARD$/);
  const count = observed.executed.length;
  await assert.rejects(readAtomic(ctx, [sql('DELETE FROM ik_jobs')]), /IMPORT_READ_GUARD_REQUIRED/);
  // Copying assertion-shaped SQL does not produce an associated scalar guard.
  await assert.rejects(readAtomic(ctx, [{ ...guard(sql('1')) }]), /IMPORT_READ_GUARD_REQUIRED/);
  assert.equal(observed.executed.length, count); observed.assertSelectOnly();
  const wide = Array.from({ length: 53 }, (_, i) => guard(sql(`1 /* distinct ${i} */`)));
  assert.equal(packGuards(wide, true).length, 2);
  await readAtomic(ctx, wide);
});

test('SELECT fence rejects a whole over-budget batch before executing any group', async t => {
  const r = await sqliteRuntime(t), observed = observeReads(r.db());
  const ctx = requestContext({ ...r.context(), storage: { ...r.context().storage, database: observed.database } });
  for (let n = 0; n < 999; n++) await ctx.storage.database.prepare('SELECT 1').first();
  const count = totalChanges(r.native()), executed = observed.executed.length;
  const guards = Array.from({ length: 51 }, (_, i) => guard(sql(`1 /* ${i} */`)));
  const limited = requestContext({ ...r.context(), storage: { ...r.context().storage, database: observed.database } });
  for (let n = 0; n < 1000; n++) await limited.storage.database.prepare('SELECT 1').first();
  const beforeBatch = observed.executed.length;
  await assert.rejects(readAtomic(limited, guards), /IMPORT_D1_REQUEST_LIMIT/);
  assert.equal(observed.executed.length, beforeBatch); assert.equal(totalChanges(r.native()), count);
  await readAtomic(ctx, guards);
  assert.equal(observed.executed.length, executed + 1002, 'all packed groups execute in the final one-query batch');
  await assert.rejects(readAtomic(ctx, []), /IMPORT_D1_REQUEST_LIMIT/);
});

test('SELECT guard SQL/provider errors remain errors with zero changes', async t => {
  const r = await sqliteRuntime(t), count = totalChanges(r.native());
  await assert.rejects(readAtomic(r.context(), [guard(sql('(SELECT private_value FROM absent_table)'))]), /no such table/);
  assert.equal(totalChanges(r.native()), count);
});

test('incomplete, malformed and explicitly failed real batch replies reject before publication', async t => {
  const r = await sqliteRuntime(t), db = r.db(), count = totalChanges(r.native());
  // Deliberate broken transport replies around actual successful SQL, never
  // fabricated success values. Both valid driver shapes run in the tests above.
  for (const damage of [() => undefined, (v: unknown[]) => v.slice(1), () => [null], () => [[]], () => [{ results: [{ ok: '1' }] }], (v: unknown[]) => [{ success: false, results: v[0] }], (v: unknown[]) => [{ error: 'private-provider-detail', results: v[0] }]]) {
    const damaged = { prepare: db.prepare, async batch(statements: any[]) { return damage(await db.batch(statements)) as any; } };
    const ctx = { ...r.context(), storage: { ...r.context().storage, database: damaged } };
    await assert.rejects(readAtomic(ctx, [guard(sql('1'))]), /IMPORT_ATOMIC_GUARD/);
  }
  assert.equal(totalChanges(r.native()), count);
});

test('read packing retains parameter snapshots, byte ceilings and mutation ordering', () => {
  const predicate = sql('length(?)=?', '🌱'.repeat(200000), 200000), first = guard(predicate);
  predicate.sql = '0'; predicate.params![0] = 'changed';
  const second = guard(sql('length(?)=?', '漢'.repeat(266667), 266667));
  const packed = packGuards([first, second], true);
  assert.equal(packed.length, 2, 'aggregate bound bytes split groups before 1.5 MB');
  assert.equal(packed[0].params![0], '🌱'.repeat(200000));
  const long = [guard(sql(`1 /* ${'x'.repeat(46000)} */`)), guard(sql(`1 /* ${'y'.repeat(46000)} */`))];
  assert.equal(packGuards(long, true).length, 2, 'predicate SQL bytes split groups before 90 KB');
  const mutation = sql('UPDATE native_authority SET enabled=0');
  const writing = packGuards([first, mutation, second]);
  assert.equal(writing.length, 3); assert.equal(writing[1], mutation);
  assert.ok(writing[0].sql.startsWith('INSERT INTO ik_d1_assertions'));
  assert.ok(writing[2].sql.startsWith('INSERT INTO ik_d1_assertions'));
});
