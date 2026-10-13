import test from 'node:test';
import assert from 'node:assert/strict';
import { provenanceTransportFixture } from './d1/provenance-transport-fixture.ts';
import { applyD1ImportBatches, readD1ImportUndoReport, undoD1Import } from '../src/d1/index.ts';

for (const [name, mutation] of [
  ['authority', "UPDATE native_authority SET enabled=0 WHERE id='owner'"],
  ['custody', 'UPDATE ik_d1_custody_revisions SET revision=revision+1'],
] as const) test(`bounded undo report rejects late ${name} changes between SELECT-only guard batches`, async t => {
  const r = await provenanceTransportFixture(t, 4, true), meter = r.meter;
  assert.equal((await meter.request('apply-owner', () => applyD1ImportBatches(r.job.id, r.context()))).state, 'completed');
  r.largeProvenance(); r.clean();
  assert.equal((await meter.request('first-undo', () => undoD1Import(r.job.id, { ...r.context(1), maxBatches: 1 }))).state, 'undoing');
  const native = r.native();
  const snapshot = () => Object.fromEntries([
    'ik_jobs', 'ik_provenance', 'ik_sources', 'ik_batches', 'ik_d1_reversal_reports',
    'ik_d1_custody_revisions', 'native_authority', 'native_records', 'native_parts',
  ].map(table => [table, native.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const before = snapshot();
  const input = r.context(); let guardBatches = 0, injected = false;
  const database = { ...input.storage.database, async batch(statements: any[]) {
    if (statements.some(statement => statement.query.includes('ik_d1_custody_states') && statement.query.startsWith('SELECT CASE'))) {
      guardBatches++;
      if (guardBatches === 2) { native.exec(mutation); injected = true; }
    }
    assert.ok(statements.every(statement => statement.query.startsWith('SELECT ')));
    return input.storage.database.batch(statements);
  } };
  await assert.rejects(meter.request('rejected-report', () => readD1ImportUndoReport(r.job.id, {
    ...input, storage: { ...input.storage, database },
  })), /IMPORT_ATOMIC_GUARD/);
  assert.ok(injected, 'the fault occurred after an earlier exact guard batch');
  assert.equal(meter.requests.find(request => request.label === 'rejected-report')!.privateBatches, 0);
  const after = snapshot();
  for (const table of Object.keys(before).filter(table => !['native_authority','ik_d1_custody_revisions'].includes(table))) assert.deepEqual(after[table], before[table], table);
  r.clean();
  if (name === 'authority') native.exec("UPDATE native_authority SET enabled=1 WHERE id='owner'");
  r.reopen();
  const report = await meter.request('cold-report', () => readD1ImportUndoReport(r.job.id, r.context()));
  assert.equal(report.cursor, 1); assert.equal(report.total, 1);
  assert.equal(report.dispositions[0].targetId, '3'); assert.equal(report.dispositions[0].disposition, 'reversed');
  r.clean();
  console.log(JSON.stringify({ boundedUndoReportGuard: { mutation: name, guardBatches, ...meter.summary() } }));
});
