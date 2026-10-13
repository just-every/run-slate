import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source } from './fixtures.ts';
import { nativeSetTargets } from './preserved-native-set.ts';
import { meter } from './meter.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, undoD1Import, readD1ImportUndoReport, resumeD1Import } from '../../src/d1/index.ts';

test('real D1 full native set and accumulated report guards remain exact across bounded undo and restart', async t => {
  const r = await runtime(t);
  await r.db().prepare('CREATE TABLE native_records(destination TEXT,kind TEXT,id TEXT,revision TEXT,value_json TEXT,PRIMARY KEY(destination,kind,id))').run();
  const context = () => ({ ...r.context(), batchSize: 4, maxBatches: 1, reversalPolicy: 'preserve-conflicts' as const, storage: { database: r.db(), targets: nativeSetTargets } });
  const ctx = context(), mapping = { version: 'v1', map: (row: any) => ({ effects: [{ targetKind: 'record', targetId: row.sourceId, value: row.payload }] }) };
  const plan = await planD1Import(source(25), mapping, ctx), job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  let current = await applyD1ImportBatches(job.id, ctx);
  while (current.state !== 'completed') current = await resumeD1Import(job.id, ctx);
  await r.db().prepare("DELETE FROM native_records WHERE id='0'").run();
  await r.db().prepare("UPDATE native_records SET value_json=json_set(value_json,'$.evidence',NULL) WHERE id='1'").run();
  current = await undoD1Import(job.id, ctx);
  const prior = await readD1ImportUndoReport(job.id, ctx);
  const racing = { ...nativeSetTargets, async preparePreservedUndo(...args: Parameters<NonNullable<typeof nativeSetTargets.preparePreservedUndo>>) {
    const snapshot = await nativeSetTargets.preparePreservedUndo!(...args);
    await r.db().prepare("UPDATE ik_d1_reversal_reports SET record_json=replace(record_json,'edited','editex') WHERE position=0").run();
    return snapshot;
  } };
  await assert.rejects(resumeD1Import(job.id, { ...ctx, storage: { database: r.db(), targets: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT reversal_cursor FROM ik_jobs').first())!.reversal_cursor, prior.cursor);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_reversal_reports').first())!.n, prior.total);
  await r.db().prepare("UPDATE ik_d1_reversal_reports SET record_json=replace(record_json,'editex','edited') WHERE position=0").run();
  await r.reopen();
  const m = meter(r.db()), reopened = { ...context(), storage: { database: m.database, targets: nativeSetTargets } };
  while (current.state !== 'undone') current = await m.request('resume', () => resumeD1Import(job.id, reopened));
  const report = await m.request('terminal-report', () => readD1ImportUndoReport(job.id, reopened));
  assert.equal(report.cursor, 25); assert.equal(report.total, 25);
  assert.equal(report.dispositions.filter(d => d.disposition === 'retained').length, 2);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM native_records').first())!.n, 1);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_assertions').first())!.n, 0);
  console.log(JSON.stringify({ fullSetProvider: m.snapshots }));
});
