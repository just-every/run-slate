import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, readD1PersistedImport } from '../../src/d1/index.ts';
import type { D1TargetAdapter } from '../../src/d1/types.ts';

test('real D1: export rejects an import committed after native list captured its rows', async t => {
  const r = await runtime(t), ctx = r.context();
  const plan = await planD1Import(source(2), mapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  assert.equal((await applyD1ImportBatches(job.id, { ...ctx, maxBatches: 1 })).checkpoint, 1);
  let injected = false;
  const racing = { ...targets, async list(...args: Parameters<typeof targets.list>) {
    const rows = await targets.list(...args);
    if (!injected) { injected = true; assert.equal((await applyD1ImportBatches(job.id, ctx)).state, 'completed'); }
    return rows;
  } };
  await assert.rejects(readD1PersistedImport({ ...ctx, storage: { ...ctx.storage, targets: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(injected, true);
  const exported = await readD1PersistedImport(ctx);
  assert.equal(exported.rows.length, 2); assert.equal(exported.provenance.length, 2);
  assert.deepEqual(exported.rows.map(r => r.targetId).sort(), exported.provenance.map(p => p.targetId).sort());
});

test('real D1: export rejects a native insertion after an empty list snapshot', async t => {
  const r = await runtime(t), ctx = r.context();
  const racing = { ...targets, async list(...args: Parameters<typeof targets.list>) {
    const rows = await targets.list(...args);
    await r.db().batch(targets.write({ destination: ctx.destination, targetKind: 'contact', targetId: 'native', revision: 'native-1', value: { email: 'native@example.test', evidence: 'native' } }).map(s => r.db().prepare(s.sql).bind(...s.params!)));
    return rows;
  } };
  await assert.rejects(readD1PersistedImport({ ...ctx, storage: { ...ctx.storage, targets: racing } }), /IMPORT_ATOMIC_GUARD/);
  const exported = await readD1PersistedImport(ctx);
  assert.equal(exported.rows.length, 1); assert.equal(exported.provenance.length, 0);
});

test('real D1: export requires native set guards even for an empty destination', async t => {
  const r = await runtime(t), ctx = r.context();
  const unguarded = { ...targets, matchesCount: undefined, matchesMany: undefined };
  await assert.rejects(readD1PersistedImport({ ...ctx, storage: { ...ctx.storage, targets: unguarded } }), /IMPORT_NATIVE_SET_GUARD_REQUIRED/);
  assert.deepEqual(await readD1PersistedImport(ctx), { rows: [], provenance: [] });
});

test('real D1: an empty matchesMany result cannot bypass the native set guard', async t => {
  const r = await runtime(t), ctx = r.context();
  const unguarded = { ...targets, matchesMany: () => [] };
  await assert.rejects(readD1PersistedImport({ ...ctx, storage: { ...ctx.storage, targets: unguarded } }), /IMPORT_NATIVE_SET_GUARD_REQUIRED/);
});

test('real D1: matchesMany exports exact rows and rejects a same-count evidence edit', async t => {
  const r = await runtime(t), ctx = r.context();
  const many: D1TargetAdapter = { ...targets, matchesCount: undefined, matchesMany(rows, destination) {
    return [targets.matchesCount!(rows.length, destination), ...rows.map(row => targets.matches(row, destination, row.targetKind, row.targetId))];
  } };
  const plan = await planD1Import(source(1), mapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  await applyD1ImportBatches(job.id, ctx);
  const context = { ...ctx, storage: { ...ctx.storage, targets: many } };
  assert.deepEqual(await readD1PersistedImport(context), await readD1PersistedImport(ctx));
  const racing = { ...many, async list(...args: Parameters<typeof targets.list>) {
    const rows = await many.list(...args);
    await r.db().prepare("UPDATE evidence SET detail='native correction'").run();
    return rows;
  } };
  await assert.rejects(readD1PersistedImport({ ...ctx, storage: { ...ctx.storage, targets: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT detail FROM evidence').first())?.detail, 'native correction');
});
