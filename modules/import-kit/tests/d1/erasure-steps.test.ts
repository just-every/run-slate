import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { erasureStepFixture } from './erasure-step-fixture.ts';
import { sqliteSource, sqliteMapping } from './sqlite-runtime.ts';
import { planD1Import, createD1ImportJob, resumeD1Import, undoD1Import, canonicalJson, sha256, readD1ErasureJournal, retireD1ImportCustodyStep, retireD1ImportCustody, eraseD1ImportTargetStep, NativeStageRows } from '../../src/d1/index.ts';
import { createPortability, readArchive } from '../../../portability/index.mjs';

const count = (r: any, table: string) => r.native().prepare(`SELECT count(*) n FROM ${table}`).get().n;
const peers = (r: any) => [r.native().prepare("SELECT * FROM native_records WHERE id<>'0' ORDER BY id").all(), r.native().prepare("SELECT * FROM native_parts WHERE target_id<>'0' ORDER BY target_id,ordinal").all()];
const policy = { product: 'erasure-steps', partBytes: 2 * 1024 * 1024, excludeTables: ['native_authority', 'native_clock', 'native_publication_fence'] };
async function tables(r: any) {
  return r.native().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'rer_portability_%' ORDER BY name").all().filter((row: any) => !policy.excludeTables.includes(row.name)).map(({ name }: any) => {
    const columns = r.native().prepare(`PRAGMA table_info(${name})`).all(), primary = columns.filter((row: any) => row.pk).sort((a: any, b: any) => a.pk - b.pk);
    return [name, r.native().prepare(`SELECT * FROM ${name} ORDER BY ${(primary.length ? primary : columns).map((row: any) => '"' + row.name + '"').join(',')}`).all()];
  });
}

test('legacy >16 MiB import erasure resumes journaled requests, survives lost acknowledgements, restores and keeps peer undo', async t => {
  const r = await erasureStepFixture(t); r.native().exec('INSERT INTO privacy_epoch VALUES(0)');
  const source = sqliteSource(60); source.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  for (const [i, row] of source.records.entries()) {
    row.payload = { rows: [`Distinct-${i}-marker ${'Historical profile wording. '.repeat(4000)}—日本語😀`] };
    row.payloadHash = sha256(canonicalJson(row.payload));
  }
  const legacy = () => ({ ...r.context(), maxBatchBytes: undefined, maxBatches: 1 });
  const plan = await planD1Import(source, sqliteMapping, legacy());
  let job = await createD1ImportJob(plan, { ...legacy(), reviewedFingerprint: plan.fingerprint });
  while (job.state !== 'completed') job = await resumeD1Import(job.id, legacy());
  const bytes = r.native().prepare('SELECT sum(length(CAST(body AS BLOB))) n FROM ik_d1_plan_chunks WHERE job_id=?').get(job.id)!.n as number;
  assert.ok(bytes > 16 * 1024 * 1024); const before = peers(r);
  const options = { operationKey: 'erase-historical-person', maxStatements: 650 };
  const admitted = await r.erase('0', { ...options, admissionOnly: true });
  assert.equal(admitted.result.phase, 'pending'); assert.equal(count(r, 'ik_d1_native_staging'), 0); assert.equal(count(r, 'ik_d1_erasure_progress'), 0);
  let step = await r.erase('0', options), requests = 1, carried = 0, interrupted = false, lostPublication = false, maximum = step.maximum;
  assert.equal(step.response.status, 202); assert.equal(step.result.phase, 'pending');
  while (step.result.phase !== 'complete' && requests < 30) {
    if (count(r, 'ik_d1_native_staging')) carried++;
    if (!interrupted) {
      r.fault(queries => queries.some(row => row.sql.startsWith('INSERT INTO ik_d1_native_staging_values')));
      await assert.rejects(r.erase('0', options), /connection lost after commit/); interrupted = true; r.reopen();
    }
    if (!lostPublication) r.fault(queries => queries.some(row => row.sql.startsWith('UPDATE ik_d1_erasure_progress') && row.params.includes('complete')));
    try { step = await r.erase('0', options); }
    catch (error) { assert.match(String(error), /connection lost after commit/); lostPublication = true; r.reopen(); step = await r.erase('0', options); }
    maximum = Math.max(maximum, step.maximum); requests++;
  }
  assert.equal(step.response.status, 200); assert.equal(step.result.phase, 'complete'); assert.ok(carried > 0 && interrupted && lostPublication);
  assert.deepEqual(peers(r), before); assert.equal(count(r, 'ik_d1_native_staging'), 0);
  for (const table of ['ik_d1_native_staging_index', 'ik_d1_native_staging_values', 'ik_d1_erasure_tally', 'ik_d1_assertions', 'ik_d1_publication_fences', 'native_publication_fence']) assert.equal(count(r, table), 0, table);
  assert.equal(r.native().prepare('SELECT value FROM privacy_epoch').get()!.value, 1);
  assert.equal((await readD1ErasureJournal(r.context())).length, 1);
  for (const [name, rows] of await tables(r)) assert.ok(!JSON.stringify(rows).includes('Distinct-0-marker'), name);
  const repeated = await r.erase('0', options); assert.equal(repeated.result.phase, 'complete');
  assert.equal(r.native().prepare('SELECT value FROM privacy_epoch').get()!.value, 1);
  await assert.rejects(r.erase('1', options), /IMPORT_ERASURE_OPERATION_CHANGED/);

  const schema = await readFile(new URL('../../../portability/schema/portability.sql', import.meta.url), 'utf8');
  r.native().exec(schema);
  const service = await createPortability({ db: r.archiveDatabase(), policy });
  const archiveId = await service.exports.create();
  while ((await service.exports.advance(archiveId, { maxParts: 10 })).phase === 'building') {}
  const records: any[] = []; for await (const record of readArchive(await service.exports.download(archiveId))) records.push(record);
  const expected = await tables(r), restored = await erasureStepFixture(t); restored.native().exec(schema);
  const restore = await createPortability({ db: restored.archiveDatabase(), policy }), restoreId = await restore.imports.create(records[0]);
  for (const part of records.filter(row => row.kind === 'part')) await restore.imports.uploadPart(restoreId, part.index, part);
  const closing = records.at(-1); assert.equal((await restore.imports.finalize(restoreId, closing)).phase, 'complete');
  assert.deepEqual(await tables(restored), expected);
  const restoredLegacy = () => ({ ...restored.context(), maxBatchBytes: undefined });
  let undone = await undoD1Import(job.id, restoredLegacy());
  while (undone.state !== 'undone') undone = await resumeD1Import(job.id, restoredLegacy());
  assert.equal(count(restored, 'native_records'), 0); assert.equal(count(restored, 'native_parts'), 0);
  t.diagnostic(JSON.stringify({ retainedPlanBytes: bytes, requests, carriedRequests: carried, maximumErasureBatchBytes: maximum, archiveParts: records.filter(row => row.kind === 'part').length }));
});

test('bounded retirement closes header custody and redacts shared fields while refusing unverified offsets', async t => {
  const r = await erasureStepFixture(t); r.native().exec('INSERT INTO privacy_epoch VALUES(0)');
  const source = sqliteSource(3); source.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  for (const [i, row] of source.records.entries()) { row.payload = { rows: ['actor-marker', `peer-${i}`] }; row.payloadHash = sha256(canonicalJson(row.payload)); }
  const legacy = () => ({ ...r.context(), maxBatchBytes: undefined });
  const plan = await planD1Import(source, sqliteMapping, legacy());
  const job = await createD1ImportJob(plan, { ...legacy(), reviewedFingerprint: plan.fingerprint });
  while ((await resumeD1Import(job.id, legacy())).state !== 'completed') {}
  const header = sqliteSource(1); header.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  header.records[0].sourceId = 'header-0'; header.records[0].payload = { rows: ['header-peer'] }; header.records[0].payloadHash = sha256(canonicalJson(header.records[0].payload));
  const headerPlan = await planD1Import(header, sqliteMapping, legacy());
  const retired = await createD1ImportJob(headerPlan, { ...legacy(), operationKey: 'private-header-marker', reviewedFingerprint: headerPlan.fingerprint });
  // Pending header custody must retire even while its creation snapshot exists.
  const person = { target: { kind: 'record', id: '0' }, values: ['private-header-marker'], related: { fields: [{ path: ['rows', '*'], value: 'actor-marker' }] } };
  const options = { operationKey: 'retire-related-header', maxStatements: 500 };
  const native = r.targets.remove('workspace', 'record', '0');
  r.fault(queries => queries.some(row => row.sql.startsWith('INSERT INTO ik_d1_native_staging_index')));
  await assert.rejects(retireD1ImportCustodyStep(person, native, r.context(), r.checkpoint, options), /connection lost after commit/);
  const raw = r.native().prepare('SELECT * FROM ik_d1_native_staging LIMIT 1').get()!, stage = Object.fromEntries(['id','generation','destination','namespace','mapping_version','principal_id','job_id','fingerprint','job_fence','action','values_count','chunks_count','identities'].map(key => [key, raw[key]]));
  assert.throws(() => new NativeStageRows(r.context(), stage as any, [], 'values', ['value_ordinal', 'ordinal', 'body', 'body_hash', 'body_size', 'value_chunks'], { offset: { written: 1, revision: 1 } as any }), /IMPORT_NATIVE_STAGE_OFFSET_INVALID/);
  const progress = r.native().prepare('SELECT * FROM ik_d1_erasure_progress').get()!;
  r.native().exec('UPDATE ik_d1_erasure_progress SET index_rows=index_rows+1,revision=revision+1');
  await assert.rejects(retireD1ImportCustodyStep(person, native, r.context(), r.checkpoint, options), /IMPORT_NATIVE_STAGE_OFFSET_INVALID|IMPORT_ATOMIC_GUARD/);
  r.native().prepare('UPDATE ik_d1_erasure_progress SET index_rows=?,revision=?').run(progress.index_rows, progress.revision);
  let result = await retireD1ImportCustodyStep(person, native, r.context(), r.checkpoint, options), requests = 1;
  while (result.phase !== 'complete' && requests++ < 20) result = await retireD1ImportCustodyStep(person, native, r.context(), r.checkpoint, options);
  assert.equal(result.phase, 'complete');
  if (result.phase !== 'complete') return;
  assert.deepEqual(result.retiredJobs, [retired.id]); assert.equal(result.jobsRetired, 1);
  assert.equal(count(r, 'ik_d1_native_staging'), 0); assert.equal(count(r, 'ik_d1_erasure_tally'), 0);
  for (const [name, rows] of await tables(r)) for (const marker of ['actor-marker', 'private-header-marker']) assert.ok(!JSON.stringify(rows).includes(marker), name);
  let undone = await undoD1Import(job.id, r.context());
  while (undone.state !== 'undone') undone = await resumeD1Import(job.id, r.context());
  assert.equal(count(r, 'native_records'), 0);
  // With headers alone, the retired job is also the private stage's anchor.
  const anchor = await createD1ImportJob(headerPlan, { ...legacy(), operationKey: 'anchor-header-marker', reviewedFingerprint: headerPlan.fingerprint });
  const anchorOptions = { operationKey: 'erase-only-header', maxStatements: 500 };
  let onlyHeader = await retireD1ImportCustody({ values: ['anchor-header-marker'] }, [], r.context(), r.checkpoint, anchorOptions);
  while (onlyHeader.phase !== 'complete') onlyHeader = await retireD1ImportCustody({ values: ['anchor-header-marker'] }, [], r.context(), r.checkpoint, anchorOptions);
  assert.deepEqual(onlyHeader.retiredJobs, [anchor.id]); assert.equal(count(r, 'ik_d1_native_staging'), 0);
  const targetJob = await createD1ImportJob(headerPlan, { ...legacy(), operationKey: 'target-only-import', reviewedFingerprint: headerPlan.fingerprint });
  while ((await resumeD1Import(targetJob.id, legacy())).state !== 'completed') {}
  const targetOptions = { operationKey: 'target-only-erasure' }, targetNative = r.targets.remove('workspace', 'record', 'header-0');
  const targetResult = await eraseD1ImportTargetStep('record', 'header-0', targetNative, r.context(), targetOptions);
  assert.equal(targetResult.phase, 'complete'); assert.equal(count(r, 'native_records'), 0);
  assert.equal((await eraseD1ImportTargetStep('record', 'header-0', targetNative, r.context(), targetOptions)).phase, 'complete');
});
