import test from 'node:test';
import assert from 'node:assert/strict';
import { largeReversal } from './preserved-scale-fixture.ts';
import { observeReads, publicReads, sqliteSnapshot, totalChanges } from './read-only-tools.ts';

const races: [string, number, string][] = [
  ...[0, 1, 2, 3].map(index => ['revoked authority', index, 'UPDATE native_authority SET enabled=0'] as [string, number, string]),
  ['job binding', 0, "UPDATE ik_jobs SET principal_id='other'"],
  ['job fence', 0, 'UPDATE ik_jobs SET fence=fence+1'],
  ['job state', 0, "UPDATE ik_jobs SET state='rolling_back'"],
  ['plan equal-length bytes without digest update', 0, "UPDATE ik_jobs SET plan_json=replace(plan_json,'original','corrupt!')"],
  ['unexpected inline plan chunk', 0, "INSERT INTO ik_d1_plan_chunks SELECT id,0,'private-insertion' FROM ik_jobs"],
  ['original version', 1, 'UPDATE ik_original_sets SET version=2'],
  ['original metadata', 1, "UPDATE ik_originals SET name='private-name'"],
  ['original bytes', 1, "UPDATE ik_d1_original_chunks SET bytes='AAAA' WHERE ordinal=0"],
  ['original order', 1, 'UPDATE ik_d1_original_chunks SET ordinal=77 WHERE ordinal=0'],
  ['original deletion', 1, 'DELETE FROM ik_d1_original_chunks WHERE ordinal=0'],
  ['original insertion', 1, 'INSERT INTO ik_d1_original_chunks SELECT job_id,kind,original_key,77,bytes FROM ik_d1_original_chunks WHERE ordinal=0'],
  ['native same-revision values', 2, "UPDATE native_records SET value_json=replace(value_json,'original','corrupt!')"],
  ['report outside requested page', 3, "UPDATE ik_d1_reversal_reports SET record_json=replace(record_json,'unchanged','unchangex') WHERE position=4"],
  ['report deletion outside requested page', 3, 'DELETE FROM ik_d1_reversal_reports WHERE position=4'],
  ['report order outside requested page', 3, 'UPDATE ik_d1_reversal_reports SET position=44 WHERE position=4'],
  ['report insertion outside requested page', 3, "INSERT INTO ik_d1_reversal_reports SELECT job_id,'private-extra',44,record_json FROM ik_d1_reversal_reports WHERE position=4"],
  ['reversed flag outside requested page', 3, 'UPDATE ik_provenance SET reversed=0 WHERE id=(SELECT effect_id FROM ik_d1_reversal_reports WHERE position=4)'],
  ['source claims', 3, "UPDATE ik_sources SET source_hash='private-altered'"],
  ['journal', 3, 'UPDATE ik_batches SET end_position=end_position+1'],
  ['decision inventory', 3, "UPDATE ik_d1_entries SET effects_hash='private-altered'"],
];
for (const [name, index, mutation] of races) test(`SELECT-only read ${index} rejects late ${name} without disclosing candidates`, async t => {
  const r = await largeReversal(t, 6), native = r.native();
  let batches = 0, injected = false, before: any, count = -1, delivered = false;
  const observed = observeReads(r.db(), () => {
    if (++batches !== 2) return;
    native.exec(mutation); injected = true;
    before = sqliteSnapshot(native); count = totalChanges(native);
    // The racer may write, but the ensuing read fence must work without writes.
    native.exec('PRAGMA query_only=ON');
  });
  const ctx = { ...r.context(), storage: { ...r.context().storage, database: observed.database } };
  await assert.rejects(publicReads(r.job.id, ctx)[index]().then(value => { delivered = true; return value; }), error => {
    assert.equal((error as Error).message, 'IMPORT_ATOMIC_GUARD');
    assert.doesNotMatch(String(error), /private-|original|corrupt!/); return true;
  });
  assert.equal(injected, true); assert.equal(delivered, false);
  assert.equal(totalChanges(native), count); assert.deepEqual(sqliteSnapshot(native), before); observed.assertSelectOnly();
});
