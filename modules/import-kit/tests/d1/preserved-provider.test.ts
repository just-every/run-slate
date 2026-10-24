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

test('real D1 reviewed strict conversion preserves custody, current undo authority and later activity', async t => {
  const { previewD1PreservedUndo, convertD1ReversalPolicy, D1ReversalPolicyConversionError, canonicalJson } = await import('../../src/d1/index.ts');
  const r = await runtime(t);
  await r.db().prepare('CREATE TABLE later_activity(id TEXT PRIMARY KEY,kind TEXT,contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,payload TEXT)').run();
  const adapter: D1TargetAdapter = { ...preserved, async preparePreservedUndo(db, destination, effects) {
    const snapshot = await preserved.preparePreservedUndo!(db, destination, effects);
    const activity = (await db.prepare('SELECT * FROM later_activity ORDER BY id').all()).results;
    snapshot.dependencies = activity.flatMap(row => {
      const effect = effects.find(e => e.expected.targetId === row.contact_id);
      return effect ? [{ requiredEffectId: effect.provenance.id, cause: { table: 'later_activity', recordId: row.id }, evidence: { kind: row.kind } }] : [];
    });
    snapshot.guards.push({ sql: "(SELECT json_group_array(json_array(id,kind,contact_id,payload)) FROM (SELECT * FROM later_activity ORDER BY id))=?", params: [canonicalJson(activity.map(row => [row.id,row.kind,row.contact_id,row.payload]))] });
    return snapshot;
  } };
  const context = () => ({ ...r.context(), storage: { database: r.db(), targets: adapter } });
  const snapshot = async () => {
    const tables = (await r.db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
    return Object.fromEntries(await Promise.all(tables.map(async row => [row.name, (await r.db().prepare(`SELECT * FROM "${row.name}" ORDER BY rowid`).all()).results])));
  };
  const refuse = async (operation: () => Promise<unknown>, code: string) => {
    const before = await snapshot();
    await assert.rejects(operation(), error => error instanceof D1ReversalPolicyConversionError && error.code === code);
    assert.deepEqual(await snapshot(), before);
  };
  const plan = await planD1Import(source(3), mapping, context());
  const job = await createD1ImportJob(plan, { ...context(), reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(job.id, context());
  // Strict progress already committed row 2. Conversion never repeats it.
  await undoD1Import(job.id, { ...context(), maxBatches: 1 });
  await r.db().prepare("UPDATE evidence SET detail='owner corrected spelling' WHERE id='0'").run();
  await assert.rejects(undoD1Import(job.id, { ...context(), batchSize: 2 }), /NATIVE_EDIT_CONFLICT/);
  await r.db().batch(['receipt','signed-lease','maintenance'].map((kind, i) => r.db().prepare('INSERT INTO later_activity VALUES(?,?,?,?)').bind(String(i),kind,'0',`${kind} evidence`)));
  const beforePreview = await snapshot(), preview = await previewD1PreservedUndo(job.id, context());
  assert.deepEqual(await snapshot(), beforePreview);
  assert.equal(preview.dispositions.filter(d => d.disposition === 'retained').length, 1);
  const convert = (fingerprint: string, ctx = context()) => convertD1ReversalPolicy(job.id, ctx, { to: 'preserve-conflicts', reviewedFingerprint: fingerprint });
  await refuse(() => convert('stale'), 'IMPORT_CONVERSION_REVIEW_CHANGED');
  await refuse(() => convert(preview.reviewedFingerprint, r.context()), 'IMPORT_CONVERSION_UNAVAILABLE');
  await refuse(() => convert(preview.reviewedFingerprint, { ...context(), storage: { database: r.db(), targets: { ...adapter, async preparePreservedUndo(...args) { return { ...await adapter.preparePreservedUndo!(...args), guards: [] }; } } } }), 'IMPORT_CONVERSION_UNAVAILABLE');
  await r.db().prepare('UPDATE sessions SET enabled=0').run();
  const denied = await snapshot();
  await assert.rejects(convert(preview.reviewedFingerprint), /IMPORT_ATOMIC_GUARD/);
  assert.deepEqual(await snapshot(), denied);
  await r.db().prepare('UPDATE sessions SET enabled=1').run();
  const beforeReadOnly = await snapshot();
  await assert.rejects(convert(preview.reviewedFingerprint, { ...context(), authorization: { principalId: 'owner', predicate: action => ({ sql: action === 'read' ? '1' : '0' }) } }), /IMPORT_ATOMIC_GUARD/);
  assert.deepEqual(await snapshot(), beforeReadOnly);
  await assert.rejects(convert(preview.reviewedFingerprint, { ...context(), authorization: { ...context().authorization, principalId: 'other' } }), /JOB_BINDING_MISMATCH/);
  await r.db().prepare("INSERT INTO later_activity VALUES('late','ledger','0','settled payment')").run();
  await refuse(() => convert(preview.reviewedFingerprint), 'IMPORT_CONVERSION_REVIEW_CHANGED');
  const fresh = await previewD1PreservedUndo(job.id, context());
  // A write-trigger revocation must roll back policy AND journal in one batch.
  await r.db().prepare("CREATE TRIGGER revoke_conversion AFTER INSERT ON ik_d1_policy_conversions BEGIN UPDATE sessions SET enabled=0; END").run();
  const beforeRace = await snapshot();
  await assert.rejects(convert(fresh.reviewedFingerprint), /IMPORT_ATOMIC_GUARD|IMPORT_FINAL_GUARD/);
  assert.deepEqual(await snapshot(), beforeRace);
  await r.db().prepare('DROP TRIGGER revoke_conversion').run();
  const before = await snapshot();
  const undoOnly = { ...context(), authorization: { principalId: 'owner', predicate: (action: string) => action === 'undo' ? r.context().authorization.predicate('undo', 'workspace') : { sql: '0' } } };
  await convert(fresh.reviewedFingerprint, undoOnly);
  const after = await snapshot();
  for (const table of ['ik_provenance','ik_sources','ik_originals','ik_original_sets','ik_d1_original_chunks','ik_d1_history','ik_d1_entries','ik_batches','ik_d1_plan_chunks','contacts','evidence','later_activity']) assert.deepEqual(after[table], before[table]);
  const report = await readD1ImportUndoReport(job.id, context());
  assert.equal(report.conversion!.previouslyReversed, 1);
  assert.equal(report.conversion!.policyHash, after.ik_jobs[0].reversal_policy_hash);
  assert.equal(report.cursor, 1);
  await refuse(() => convert(fresh.reviewedFingerprint), 'IMPORT_CONVERSION_ALREADY_CONVERTED');
  await assert.rejects(r.db().prepare('DELETE FROM ik_d1_policy_conversions').run(), /IMPORT_POLICY_CONVERSION_APPEND_ONLY/);
  await r.reopen();
  assert.deepEqual(await readD1ImportUndoReport(job.id, context()), report);
  // The adapter's whole dependency snapshot still fences every later batch.
  const racing = { ...adapter, async preparePreservedUndo(...args: Parameters<NonNullable<D1TargetAdapter['preparePreservedUndo']>>) {
    const result = await adapter.preparePreservedUndo!(...args);
    await r.db().prepare("INSERT INTO later_activity VALUES('race','signed-amendment','0','signed')").run();
    return result;
  } };
  await assert.rejects(undoD1Import(job.id, { ...context(), storage: { database: r.db(), targets: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await readD1ImportUndoReport(job.id, context())).cursor, 1);
  const protectedRows = (await r.db().prepare('SELECT * FROM later_activity ORDER BY id').all()).results;
  await undoD1Import(job.id, context());
  const result = await readD1ImportUndoReport(job.id, context());
  assert.equal(result.outcome, 'compensated');
  assert.equal(result.dispositions.filter(d => d.disposition === 'retained').length, 1);
  assert.deepEqual((await r.db().prepare('SELECT * FROM later_activity ORDER BY id').all()).results, protectedRows);
  assert.equal((await r.db().prepare("SELECT COUNT(*) AS n FROM contacts WHERE id='0'").first())!.n, 1);
  const terminal = await snapshot();
  await undoD1Import(job.id, context());
  assert.deepEqual(await snapshot(), terminal);
});
