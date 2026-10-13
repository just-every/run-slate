import test from 'node:test';
import assert from 'node:assert/strict';
import { largeReversal } from './preserved-scale-fixture.ts';
import { sqliteTargets } from './sqlite-runtime.ts';
import { readD1ImportUndoReport, undoD1Import } from '../../src/d1/index.ts';

const mutations = [
  ['missing report', 'DELETE FROM ik_d1_reversal_reports WHERE position=0'],
  ['same-length report edit', "UPDATE ik_d1_reversal_reports SET record_json=replace(record_json,'unchanged','unchangex') WHERE position=0"],
  ['report ordering', 'UPDATE ik_d1_reversal_reports SET position=100 WHERE position=0'],
  ['report addition', "INSERT INTO ik_d1_reversal_reports SELECT job_id,'extra',100,record_json FROM ik_d1_reversal_reports WHERE position=0"],
  ['provenance flag', 'UPDATE ik_provenance SET reversed=0 WHERE id=(SELECT effect_id FROM ik_d1_reversal_reports WHERE position=0)'],
  ['native same-revision value', "UPDATE native_records SET value_json=replace(value_json,'original','corrupt!')"],
  ['job mode', "UPDATE ik_jobs SET state='rolling_back'"],
  ['authority', 'UPDATE native_authority SET enabled=0'],
] as const;
function publication(native: ReturnType<Awaited<ReturnType<typeof largeReversal>>['native']>) {
  return Object.fromEntries(['ik_jobs','ik_provenance','ik_sources','ik_batches','ik_d1_reversal_reports','native_records'].map(table => [table, native.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}
for (const [name, mutation] of mutations) test(`late ${name} rejects the undo transaction without publication`, async t => {
  const r = await largeReversal(t, 4), native = r.native();
  let injected = false, before: ReturnType<typeof publication>;
  const targets = { ...sqliteTargets, async preparePreservedUndo(...args: Parameters<NonNullable<typeof sqliteTargets.preparePreservedUndo>>) {
    const snapshot = await sqliteTargets.preparePreservedUndo!(...args);
    native.exec(mutation); injected = true; before = publication(native);
    return snapshot;
  } };
  await assert.rejects(undoD1Import(r.job.id, { ...r.context(), batchSize: 1, maxBatches: 1, storage: { database: r.db(), targets } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(injected, true); assert.deepEqual(publication(native), before!);
  assert.equal(native.prepare('SELECT COUNT(*) AS n FROM ik_d1_assertions').get()!.n, 0);
});

for (const [name, mutation] of mutations.filter(([name]) => name !== 'native same-revision value')) test(`late ${name} cannot escape the public report read fence`, async t => {
  const r = await largeReversal(t, 4), native = r.native(), db = r.db();
  let injected = false, before: ReturnType<typeof publication>;
  const racing = { prepare: db.prepare, async batch(statements: any[]) {
    if (!injected && statements.some(s => s.query.includes('ik_d1_reversal_reports'))) {
      native.exec(mutation); injected = true; before = publication(native);
    }
    return db.batch(statements);
  } };
  await assert.rejects(readD1ImportUndoReport(r.job.id, { ...r.context(), storage: { ...r.context().storage, database: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(injected, true); assert.deepEqual(publication(native), before!);
  assert.equal(native.prepare('SELECT COUNT(*) AS n FROM ik_d1_assertions').get()!.n, 0);
});

test('same-length report corruption inside publication rolls back native reversal and all progress', async t => {
  const r = await largeReversal(t, 4), native = r.native(), before = publication(native);
  native.exec("CREATE TRIGGER corrupt_report AFTER INSERT ON ik_d1_reversal_reports BEGIN UPDATE ik_d1_reversal_reports SET record_json=replace(record_json,'unchanged','unchangex') WHERE job_id=NEW.job_id AND effect_id=NEW.effect_id; END");
  await assert.rejects(undoD1Import(r.job.id, { ...r.context(), batchSize: 1, maxBatches: 1 }), /IMPORT_ATOMIC_GUARD/);
  assert.deepEqual(publication(native), before);
  assert.equal(native.prepare('SELECT COUNT(*) AS n FROM ik_d1_assertions').get()!.n, 0);
});
