import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource, sqliteTargets } from './sqlite-runtime.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, undoD1Import, readD1ImportUndoReport, canonicalJson } from '../../src/d1/index.ts';
import type { D1TargetAdapter, D1UndoDependency } from '../../src/d1/index.ts';
async function setup(t: any, count = 4) {
  const r = await sqliteRuntime(t), ctx = { ...r.context(), reversalPolicy: 'preserve-conflicts' as const }, plan = await planD1Import(sqliteSource(count), sqliteMapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  await applyD1ImportBatches(job.id, ctx);
  return { r, job };
}
function dependencyAdapter(r: Awaited<ReturnType<typeof sqliteRuntime>>, retentionOnly: D1UndoDependency[] = []): D1TargetAdapter {
  return { ...sqliteTargets,
    remove(destination, kind, id) { return [{ sql: 'DELETE FROM native_dependencies WHERE owner=?', params: [id] }, ...sqliteTargets.remove(destination, kind, id)]; },
    async preparePreservedUndo(db, destination, effects) {
      const snapshot = await sqliteTargets.preparePreservedUndo!(db, destination, effects);
      const { results: edges } = await db.prepare('SELECT * FROM native_dependencies ORDER BY owner,target').all();
      const byTarget = new Map(effects.map(e => [e.expected.targetId, e.provenance.id]));
      snapshot.dependencies = [...edges.filter(e => byTarget.has(e.target)).map(e => ({ requiredEffectId: byTarget.get(e.target)!, ...(byTarget.has(e.owner) ? { dependentEffectId: byTarget.get(e.owner)! } : {}), cause: { table: 'native_dependencies', recordId: e.owner, targetId: e.target }, evidence: { reason: 'on-delete-restrict' } })), ...retentionOnly];
      snapshot.guards.push({ sql: '(SELECT COUNT(*) FROM native_dependencies)=?', params: [edges.length] }, ...edges.map(e => ({ sql: 'EXISTS(SELECT 1 FROM native_dependencies WHERE owner=? AND target=?)', params: [e.owner, e.target] })));
      return snapshot;
    },
  };
}
function dependencies(r: Awaited<ReturnType<typeof sqliteRuntime>>) {
  r.native().exec('CREATE UNIQUE INDEX native_id ON native_records(id); CREATE TABLE native_dependencies(owner TEXT NOT NULL REFERENCES native_records(id),target TEXT NOT NULL REFERENCES native_records(id),PRIMARY KEY(owner,target))');
}
test('unchanged owned content may exclude shared revision while strict comparison stays strict', async t => {
  const { r, job } = await setup(t, 2);
  r.native().exec("UPDATE native_records SET revision='shared-wrapper-changed' WHERE id='1'");
  r.native().prepare("UPDATE native_records SET value_json=? WHERE id='0'").run(canonicalJson({ id: '0', label: 'scalar edit' }));
  const adapter = { ...sqliteTargets, ownedContent: row => row.value };
  assert.equal((await undoD1Import(job.id, { ...r.context(), storage: { database: r.db(), targets: adapter } })).state, 'undone');
  const report = await readD1ImportUndoReport(job.id, { ...r.context(), storage: { database: r.db(), targets: adapter } });
  assert.equal(report.dispositions.find(d => d.targetId === '1')!.disposition, 'reversed');
  assert.equal(report.dispositions.find(d => d.targetId === '0')!.reason, 'edited');
});
test('fresh dependency closure retains edited descendants and ancestors, independently removes unrelated effects', async t => {
  const { r, job } = await setup(t); dependencies(r);
  r.native().exec("INSERT INTO native_dependencies VALUES('0','1'),('1','2')");
  r.native().prepare("UPDATE native_records SET value_json=? WHERE id='0'").run(canonicalJson({ id: '0', label: 'edited child' }));
  const adapter = dependencyAdapter(r), ctx = { ...r.context(), batchSize: 1, storage: { database: r.db(), targets: adapter } };
  assert.equal((await undoD1Import(job.id, ctx)).state, 'undone');
  const report = await readD1ImportUndoReport(job.id, ctx);
  assert.deepEqual(report.dispositions.filter(d => d.disposition === 'retained').map(d => d.targetId).sort(), ['0','1','2']);
  assert.ok(report.dispositions.filter(d => d.reason === 'dependency').every(d => d.protectedBy.length));
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM native_dependencies').get()!.n, 2);
});
test('unchanged acyclic dependent rows reverse before targets under live restrict foreign keys', async t => {
  const { r, job } = await setup(t); dependencies(r);
  r.native().exec("INSERT INTO native_dependencies VALUES('0','1'),('1','2')");
  const adapter = dependencyAdapter(r), ctx = { ...r.context(), batchSize: 1, storage: { database: r.db(), targets: adapter } };
  assert.equal((await undoD1Import(job.id, ctx)).state, 'undone');
  const ids = (await readD1ImportUndoReport(job.id, ctx)).dispositions.map(d => d.targetId);
  assert.ok(ids.indexOf('0') < ids.indexOf('1') && ids.indexOf('1') < ids.indexOf('2'));
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM native_records').get()!.n, 0);
});
test('outside incoming dependencies protect imported targets transitively', async t => {
  const { r, job } = await setup(t); dependencies(r);
  r.native().prepare('INSERT INTO native_records VALUES(?,?,?,?,?)').run('workspace','record','outside','native',canonicalJson({ id: 'outside' }));
  r.native().exec("INSERT INTO native_dependencies VALUES('outside','0'),('0','1')");
  const adapter = dependencyAdapter(r), ctx = { ...r.context(), storage: { database: r.db(), targets: adapter } };
  await undoD1Import(job.id, ctx);
  assert.deepEqual((await readD1ImportUndoReport(job.id, ctx)).dispositions.filter(d => d.reason === 'dependency').map(d => d.targetId).sort(), ['0','1']);
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM native_dependencies').get()!.n, 2);
});
test('retention-only edges preserve required joins without introducing a removal-order cycle', async t => {
  const { r, job } = await setup(t, 2); dependencies(r);
  // 0 is a separately owned join and 1 its owner. The physical edge orders
  // join removal before owner; the validity edge retains join when owner stays.
  r.native().exec("INSERT INTO native_dependencies VALUES('0','1')");
  const ps = r.native().prepare('SELECT * FROM ik_provenance ORDER BY target_id').all();
  const edge = { requiredEffectId: ps[0].id as string, dependentEffectId: ps[1].id as string, order: false as const, cause: { table: 'required_fields', recordId: '1', field: 'members' }, evidence: { required: true } };
  const adapter = dependencyAdapter(r, [edge]), ctx = { ...r.context(), storage: { database: r.db(), targets: adapter } };
  r.native().exec("UPDATE native_records SET revision='edited-owner' WHERE id='1'");
  await undoD1Import(job.id, ctx);
  const report = await readD1ImportUndoReport(job.id, ctx);
  assert.equal(report.dispositions.find(d => d.targetId === '0')!.reason, 'dependency');
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM native_records').get()!.n, 2);
});
for (const race of ['same-revision', 'incoming', 'second-undo']) test(`preserved preflight race is atomic: ${race}`, async t => {
  const { r, job } = await setup(t, 2); dependencies(r);
  r.native().prepare('INSERT INTO native_records VALUES(?,?,?,?,?)').run('workspace','record','outside','native',canonicalJson({ id: 'outside' }));
  const base = dependencyAdapter(r);
  let fired = false;
  const adapter = { ...base, async preparePreservedUndo(...args: Parameters<NonNullable<D1TargetAdapter['preparePreservedUndo']>>) {
    const snapshot = await base.preparePreservedUndo!(...args);
    if (!fired) {
      fired = true;
      if (race === 'same-revision') r.native().prepare("UPDATE native_records SET value_json=? WHERE id='0'").run(canonicalJson({ id: '0', label: 'racing edit' }));
      if (race === 'incoming') r.native().exec("INSERT INTO native_dependencies VALUES('outside','0')");
      if (race === 'second-undo') await undoD1Import(job.id, { ...r.context(), storage: { database: r.db(), targets: base } });
    }
    return snapshot;
  } };
  await assert.rejects(undoD1Import(job.id, { ...r.context(), storage: { database: r.db(), targets: adapter } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_d1_reversal_reports').get()!.n, race === 'second-undo' ? 2 : 0);
  if (race !== 'second-undo') assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE reversed=0').get()!.n, 2);
});
test('edited successor keeps the owner edit and releases its predecessor, which then undoes fully, while independent successor effects reverse', async t => {
  const { r, job: first } = await setup(t, 1), predecessor = r.native().prepare('SELECT * FROM ik_provenance').get()!;
  const prior = await sqliteTargets.read(r.db(), 'workspace', 'record', '0');
  const source = sqliteSource(2, 'new export'); source.records.forEach(rec => { rec.namespace = 'second'; });
  const ctx = { ...r.context(), namespace: 'second', reversalPolicy: 'preserve-conflicts' as const };
  const mapping = { version: 'v1', map: rec => ({ effects: [{ targetKind: 'record', targetId: rec.sourceId, value: rec.payload, ...(rec.sourceId === '0' ? { expectedRevision: prior!.revision } : {}) }] }) };
  const plan = await planD1Import(source, mapping, ctx), second = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  await applyD1ImportBatches(second.id, ctx);
  r.native().prepare("UPDATE native_records SET value_json=? WHERE id='0'").run(canonicalJson({ id: '0', label: 'successor edit' }));
  await undoD1Import(second.id, ctx);
  // The kept edit can never restore the predecessor: it returns to its own job's
  // provenance as reversed, in the undo's own batch, and leaves no history.
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_d1_history').get()!.n, 0);
  const released = r.native().prepare('SELECT * FROM ik_provenance WHERE id=?').get(predecessor.id)!;
  for (const key of Object.keys(predecessor)) if (!['reversed', 'record_json'].includes(key)) assert.equal(released[key], predecessor[key]);
  assert.equal(released.reversed, 1);
  assert.equal(released.record_json, canonicalJson({ ...JSON.parse(predecessor.record_json as string), reversed: true }));
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM native_records').get()!.n, 1);
  assert.equal((await undoD1Import(first.id, r.context())).state, 'undone');
  const report = await readD1ImportUndoReport(first.id, r.context());
  assert.deepEqual(report.dispositions.map(d => [d.targetId, d.disposition, d.reason]), [['0', 'retained', 'superseded']]);
  assert.equal(r.native().prepare("SELECT value_json FROM native_records WHERE id='0'").get()!.value_json, canonicalJson({ id: '0', label: 'successor edit' }));
});
test('removed predecessor history is an integrity error even when successor is edited', async t => {
  const { r } = await setup(t, 1);
  const prior = await sqliteTargets.read(r.db(), 'workspace', 'record', '0');
  const source = sqliteSource(1, 'next export'); source.records[0].namespace = 'second';
  const ctx = { ...r.context(), namespace: 'second', reversalPolicy: 'preserve-conflicts' as const };
  const plan = await planD1Import(source, { version: 'v1', map: rec => ({ effects: [{ targetKind: 'record', targetId: '0', value: rec.payload, expectedRevision: prior!.revision }] }) }, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }); await applyD1ImportBatches(job.id, ctx);
  r.native().exec("UPDATE native_records SET revision='edited'; DELETE FROM ik_d1_history");
  await assert.rejects(undoD1Import(job.id, ctx), /IMPORT_HISTORY_MISMATCH/);
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM ik_d1_reversal_reports').get()!.n, 0);
});
test('required native owner and joins reverse atomically even with batchSize one', async t => {
  const { r, job } = await setup(t, 3); dependencies(r);
  r.native().exec("INSERT INTO native_dependencies VALUES('0','1')");
  const base = dependencyAdapter(r), ps = r.native().prepare('SELECT * FROM ik_provenance ORDER BY target_id').all();
  const adapter = { ...base, async preparePreservedUndo(...args: Parameters<NonNullable<D1TargetAdapter['preparePreservedUndo']>>) {
    const snapshot = await base.preparePreservedUndo!(...args);
    const active = args[2].map(e => e.provenance.id);
    snapshot.atomicGroups = [[ps[0].id as string, ps[1].id as string].filter(id => active.includes(id))].filter(ids => ids.length);
    return snapshot;
  } };
  const ctx = { ...r.context(), batchSize: 1, maxBatches: 1, storage: { database: r.db(), targets: adapter } };
  let result = await undoD1Import(job.id, ctx);
  while (result.state !== 'undone') {
    const native = r.native().prepare("SELECT id FROM native_records WHERE id IN ('0','1')").all();
    assert.ok(native.length === 0 || native.length === 2, 'no required-empty intermediate owner');
    result = await undoD1Import(job.id, ctx);
  }
  assert.equal((await readD1ImportUndoReport(job.id, ctx)).cursor, 3);
});
test('an edited member protects its whole required atomic unit with explicit causes', async t => {
  const { r, job } = await setup(t, 3), ps = r.native().prepare('SELECT * FROM ik_provenance ORDER BY target_id').all();
  const adapter = { ...sqliteTargets, async preparePreservedUndo(...args: Parameters<NonNullable<D1TargetAdapter['preparePreservedUndo']>>) {
    const snapshot = await sqliteTargets.preparePreservedUndo!(...args);
    snapshot.atomicGroups = [[ps[0].id as string, ps[1].id as string]];
    return snapshot;
  } };
  r.native().exec("UPDATE native_records SET revision='edited-owner' WHERE id='1'");
  const ctx = { ...r.context(), batchSize: 1, storage: { database: r.db(), targets: adapter } };
  await undoD1Import(job.id, ctx);
  const report = await readD1ImportUndoReport(job.id, ctx);
  const held = report.dispositions.find(d => d.targetId === '0')!;
  assert.equal(held.reason, 'dependency'); assert.equal(held.protectedBy[0].evidence && (held.protectedBy[0].evidence as any).reason, 'atomic-reversal-unit');
  assert.equal(r.native().prepare('SELECT COUNT(*) AS n FROM native_records').get()!.n, 2);
});
