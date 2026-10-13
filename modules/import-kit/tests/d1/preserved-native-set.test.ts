import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSetTargets, classification } from './preserved-native-set.ts';
import { sqliteRuntime, sqliteSource, sqliteMapping } from './sqlite-runtime.ts';
import { canonicalJson, createD1ImportJob, planD1Import, applyD1ImportBatches, undoD1Import, readD1ImportUndoReport } from '../../src/d1/index.ts';
import { classifyUndo } from '../../src/d1/undo-snapshot.ts';
import type { D1UndoSnapshot } from '../../src/d1/undo-types.ts';

for (const [name, mutate] of [
  ['duplicate', (s: D1UndoSnapshot) => s.nativeRows!.push(s.nativeRows![0])],
  ['wrong destination', (s: D1UndoSnapshot) => { s.nativeRows![0] = { ...s.nativeRows![0], destination: 'other' }; }],
  ['missing current', (s: D1UndoSnapshot) => { s.observations[0].current = null; }],
  ['omitted native row', (s: D1UndoSnapshot) => { s.nativeRows!.shift(); }],
  ['stale revision', (s: D1UndoSnapshot) => { s.observations[0].current = { ...s.nativeRows![0], revision: 'old' }; }],
  ['same-size changed value', (s: D1UndoSnapshot) => { s.observations[0].current = { ...s.nativeRows![0], value: { number: 1, nullable: null } }; }],
  ['changed value type', (s: D1UndoSnapshot) => { s.observations[0].current = { ...s.nativeRows![0], value: { number: '0', nullable: null } }; }],
  ['missing nullable field', (s: D1UndoSnapshot) => { s.observations[0].current = { ...s.nativeRows![0], value: { number: 0 } }; }],
] as const) test(`complete native set rejects ${name} observation`, () => {
  const { effects, snapshot, context } = classification(); mutate(snapshot);
  assert.throws(() => classifyUndo(effects, snapshot, context), /IMPORT_UNDO_SNAPSHOT_MISMATCH/);
});

test('native set coverage and nonempty bulk predicates are required; custom guards survive', () => {
  const { effects, snapshot, context } = classification();
  for (const matchesMany of [undefined, () => []]) assert.throws(() => classifyUndo(effects, snapshot, { ...context, storage: { ...context.storage, targets: { ...nativeSetTargets, matchesMany } } }), /IMPORT_NATIVE_SET_GUARD_REQUIRED/);
  snapshot.nativeRows!.splice(0, 1); snapshot.observations[0].current = null;
  snapshot.observations[0].guard = { sql: '(SELECT enabled FROM native_authority WHERE id=?)=1', params: ['marker-owner'] };
  const decision = classifyUndo(effects, snapshot, context);
  assert.equal(decision.ordered.find(d => d.effectId === '0')!.reason, 'edited');
  assert.ok(decision.guards.some(g => g.params?.includes('marker-owner')));
});

test('mixed absent, typed edited, unrelated and unchanged rows keep exact public undo semantics', async t => {
  const r = await sqliteRuntime(t), ctx = { ...r.context(), reversalPolicy: 'preserve-conflicts' as const, storage: { database: r.db(), targets: nativeSetTargets } };
  const plan = await planD1Import(sqliteSource(3), sqliteMapping, ctx), job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  await applyD1ImportBatches(job.id, ctx);
  r.native().exec("DELETE FROM native_records WHERE id='0'");
  r.native().prepare("UPDATE native_records SET value_json=? WHERE id='1'").run(canonicalJson({ id: 1, label: null }));
  r.native().prepare('INSERT INTO native_records VALUES(?,?,?,?,?)').run('workspace','record','unrelated','native', canonicalJson({ value: null }));
  assert.equal((await undoD1Import(job.id, ctx)).state, 'undone');
  const report = await readD1ImportUndoReport(job.id, ctx);
  assert.equal(report.dispositions.find(d => d.targetId === '0')!.observed.ownedValue, null);
  assert.equal(report.dispositions.find(d => d.targetId === '1')!.reason, 'edited');
  assert.equal(report.dispositions.find(d => d.targetId === '2')!.disposition, 'reversed');
  assert.deepEqual(r.native().prepare('SELECT id FROM native_records ORDER BY id').all().map(r => r.id), ['1','unrelated']);
});

test('complete native sets keep domain-specific absent-row ownership guards atomic', async t => {
  const r = await sqliteRuntime(t), ctx = { ...r.context(), reversalPolicy: 'preserve-conflicts' as const, storage: { database: r.db(), targets: nativeSetTargets } };
  const plan = await planD1Import(sqliteSource(1), sqliteMapping, ctx), job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  await applyD1ImportBatches(job.id, ctx);
  r.native().exec("DELETE FROM native_records; INSERT INTO native_authority VALUES('marker-owner',1)");
  const targets = { ...nativeSetTargets, async preparePreservedUndo(...args: Parameters<NonNullable<typeof nativeSetTargets.preparePreservedUndo>>) {
    const snapshot = await nativeSetTargets.preparePreservedUndo!(...args);
    snapshot.observations[0].guard = { sql: "EXISTS(SELECT 1 FROM native_authority WHERE id=? AND enabled=1)", params: ['marker-owner'] };
    r.native().exec("UPDATE native_authority SET enabled=0 WHERE id='marker-owner'");
    return snapshot;
  } };
  await assert.rejects(undoD1Import(job.id, { ...ctx, storage: { database: r.db(), targets } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(r.native().prepare("SELECT enabled FROM native_authority WHERE id='owner'").get()!.enabled, 1);
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_d1_reversal_reports').get()!.n, 0);
  assert.equal(r.native().prepare('SELECT reversal_cursor FROM ik_jobs').get()!.reversal_cursor, 0);
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_d1_assertions').get()!.n, 0);
});

for (const mutation of [
  "DELETE FROM native_records WHERE id='0'",
  "INSERT INTO native_records SELECT destination,kind,'extra',revision,value_json FROM native_records WHERE id='0'",
  "UPDATE native_records SET id='other' WHERE id='0'",
  "UPDATE native_records SET value_json=replace(value_json,'original','corrupt!') WHERE id='0'",
  "UPDATE native_records SET revision='changed' WHERE id='0'",
  "UPDATE native_records SET value_json='null' WHERE id='0'",
  "UPDATE native_records SET value_json=CAST(value_json AS BLOB) WHERE id='0'",
]) test(`full native set atomically rejects late mutation: ${mutation}`, async t => {
  const r = await sqliteRuntime(t), ctx = { ...r.context(), reversalPolicy: 'preserve-conflicts' as const, storage: { database: r.db(), targets: nativeSetTargets } };
  const plan = await planD1Import(sqliteSource(3), sqliteMapping, ctx), job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  await applyD1ImportBatches(job.id, ctx);
  const state = () => Object.fromEntries(['native_records','ik_jobs','ik_provenance','ik_sources','ik_batches','ik_d1_reversal_reports'].map(table => [table, r.native().prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  let before: ReturnType<typeof state>;
  const targets = { ...nativeSetTargets, async preparePreservedUndo(...args: Parameters<NonNullable<typeof nativeSetTargets.preparePreservedUndo>>) {
    const snapshot = await nativeSetTargets.preparePreservedUndo!(...args);
    r.native().exec(mutation); before = state(); return snapshot;
  } };
  await assert.rejects(undoD1Import(job.id, { ...ctx, storage: { database: r.db(), targets } }), /IMPORT_ATOMIC_GUARD/);
  assert.deepEqual(state(), before!);
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_d1_assertions').get()!.n, 0);
});
