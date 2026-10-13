import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { meter } from './meter.ts';
import { planD1Import, createD1ImportJob, preflightD1ImportJob, resumeD1Import, undoD1Import, readD1ImportUndoReport, readD1ImportOriginals, sha256 } from '../../src/d1/index.ts';
import type { D1TargetAdapter } from '../../src/d1/index.ts';
const preserved: D1TargetAdapter = { ...targets, async preparePreservedUndo(db, destination, effects) {
  const rows = await targets.list(db, destination);
  return { observations: effects.map(e => ({ effectId: e.provenance.id, current: rows.find(r => r.targetKind === e.expected.targetKind && r.targetId === e.expected.targetId) ?? null, entity: { table: 'contacts', recordId: e.expected.targetId } })), dependencies: [], guards: [targets.matchesCount!(rows.length, destination), ...rows.map(r => targets.matches(r, destination, r.targetKind, r.targetId))] };
} };
for (const [name, trigger] of [
  ['unused plan ordinal zero disappears', 'CREATE TRIGGER corrupt_plan AFTER INSERT ON ik_d1_plan_chunks WHEN NEW.ordinal=0 BEGIN DELETE FROM ik_d1_plan_chunks WHERE job_id=NEW.job_id AND ordinal=0; END'],
  ['original bytes change with preserved count', "CREATE TRIGGER corrupt_original AFTER INSERT ON ik_d1_original_chunks BEGIN UPDATE ik_d1_original_chunks SET bytes='AAAA' WHERE job_id=NEW.job_id AND kind=NEW.kind AND original_key=NEW.original_key AND ordinal=NEW.ordinal; END"],
] as const) test(`real D1 atomic creation rejects ${name} without custody writes`, async t => {
  const r = await runtime(t), ctx = r.context(), bundle = source(0), bytes = Buffer.alloc(300000, 97);
  bundle.diagnostics = [{ code: 'padding', severity: 'warning', message: 'x'.repeat(300000) }];
  bundle.artifacts = [{ name: 'raw.bin', sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }];
  const plan = await planD1Import(bundle, mapping, ctx);
  await r.db().prepare(trigger).run();
  await assert.rejects(createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }), /IMPORT_ATOMIC_GUARD/);
  for (const table of ['ik_jobs','ik_d1_plan_chunks','ik_originals','ik_original_sets','ik_d1_original_chunks','ik_d1_assertions','ik_d1_reversal_reports','ik_d1_creation_plans']) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())!.n, 0, table);
});
for (const batchSize of [1,4,20]) test(`real D1 mixed preserved undo, restart, current authority and bounded report batch ${batchSize}`, async t => {
  const r = await runtime(t), context = () => ({ ...r.context(), batchSize, storage: { database: r.db(), targets: preserved } }), ctx = { ...context(), reversalPolicy: 'preserve-conflicts' as const };
  const plan = await planD1Import(source(25), mapping, ctx), reviewed = { ...ctx, reviewedFingerprint: plan.fingerprint }, m = meter(r.db());
  const admission = preflightD1ImportJob(plan, reviewed);
  const job = await m.request('preserved-create', () => createD1ImportJob(plan, { ...reviewed, storage: { database: m.database, targets: preserved } }));
  assert.equal(m.snapshots.at(-1).count, admission.totalExecutions);
  await resumeD1Import(job.id, context());
  await r.db().prepare("UPDATE evidence SET detail='same-revision native edit' WHERE id IN ('0','1')").run();
  let current = await undoD1Import(job.id, { ...context(), maxBatches: 1 });
  await r.reopen();
  while (current.state !== 'undone') current = await resumeD1Import(job.id, { ...context(), maxBatches: 1 });
  const report = await readD1ImportUndoReport(job.id, context());
  assert.equal(report.cursor, 25); assert.equal(report.dispositions.filter(d => d.disposition === 'retained').length, 2);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())!.n, 2);
  await r.reopen(); assert.deepEqual(await readD1ImportUndoReport(job.id, context()), report);
  assert.equal((await undoD1Import(job.id, context())).state, 'undone');
  assert.equal((await readD1ImportOriginals(job.id, context())).length, 1);
  await r.db().prepare('UPDATE sessions SET enabled=0').run();
  await assert.rejects(undoD1Import(job.id, context()), /IMPORT_ATOMIC_GUARD/);
});
test('real D1 conflict-only authority revocation and report-write corruption publish no reversal', async t => {
  const r = await runtime(t), base = { ...r.context(), reversalPolicy: 'preserve-conflicts' as const, storage: { database: r.db(), targets: preserved } };
  const plan = await planD1Import(source(2), mapping, base), job = await createD1ImportJob(plan, { ...base, reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(job.id, base);
  await r.db().prepare("UPDATE evidence SET detail='edited'").run();
  const revoking: D1TargetAdapter = { ...preserved, async preparePreservedUndo(...args) { const result = await preserved.preparePreservedUndo!(...args); await r.db().prepare('UPDATE sessions SET enabled=0').run(); return result; } };
  await assert.rejects(undoD1Import(job.id, { ...base, storage: { database: r.db(), targets: revoking } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_reversal_reports').first())!.n, 0);
  assert.equal((await r.db().prepare('SELECT reversal_cursor FROM ik_jobs WHERE id=?').bind(job.id).first())!.reversal_cursor, 0);
  await r.db().prepare('UPDATE sessions SET enabled=1').run();
  await r.db().prepare("CREATE TRIGGER corrupt_report AFTER INSERT ON ik_d1_reversal_reports BEGIN UPDATE ik_d1_reversal_reports SET record_json='{}' WHERE job_id=NEW.job_id; END").run();
  await assert.rejects(undoD1Import(job.id, base), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_reversal_reports').first())!.n, 0);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE reversed=0').first())!.n, 2);
  await r.db().prepare('DROP TRIGGER corrupt_report').run();
  assert.equal((await undoD1Import(job.id, base)).state, 'undone');
  assert.equal((await readD1ImportUndoReport(job.id, base)).dispositions.filter(d => d.reason === 'edited').length, 2);
});
test('real D1 atomically grouped partial rollback preserves mixed owned effects and mode fences', async t => {
  const r = await runtime(t);
  const grouped: D1TargetAdapter = { ...preserved, async preparePreservedUndo(...args) { const result = await preserved.preparePreservedUndo!(...args); const ids = args[2].filter(e => ['0','1'].includes(e.expected.targetId)).map(e => e.provenance.id); result.atomicGroups = ids.length ? [ids] : []; return result; } };
  const ctx = { ...r.context(), reversalPolicy: 'preserve-conflicts' as const, batchSize: 3, maxBatches: 1, storage: { database: r.db(), targets: grouped } };
  const plan = await planD1Import(source(5), mapping, ctx), job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  const { applyD1ImportBatches, rollbackD1Import } = await import('../../src/d1/index.ts');
  assert.equal((await applyD1ImportBatches(job.id, ctx)).checkpoint, 3);
  await r.db().prepare("UPDATE evidence SET detail='edited' WHERE id='2'").run();
  let current = await rollbackD1Import(job.id, { ...ctx, batchSize: 1 });
  assert.equal(current.state, 'rolling_back');
  await assert.rejects(undoD1Import(job.id, ctx), /REVERSAL_MODE_CONFLICT/);
  await r.reopen();
  const reopened = { ...r.context(), batchSize: 1, storage: { database: r.db(), targets: grouped } };
  current = await resumeD1Import(job.id, reopened);
  assert.equal(current.state, 'rolled_back');
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())!.n, 1);
  const report = await readD1ImportUndoReport(job.id, reopened);
  assert.equal(report.cursor, 3); assert.equal(report.dispositions.filter(d => d.disposition === 'retained').length, 1);
});
