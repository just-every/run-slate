import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyImportBatches,
  createImportJob,
  planImport,
  readImportJob,
  readImportOriginals,
  readPersistedImport,
  readFileSource,
  reconcileImport,
  resumeImport,
  undoImport,
} from '../src/index.ts';
import {
  loadWorkspaceFixture,
  openWorkspaceContext,
  parseWorkspaceRecord,
  seedPriorState,
  workspaceMapping,
} from './fixtures/workspace-archive-v1/adapter.ts';

function visibleRows(rows: Array<{ targetKind: string; targetId: string; value: unknown }>) {
  return rows.map(({ targetKind, targetId, value }) => ({ targetKind, targetId, value }))
    .sort((left, right) => left.targetKind.localeCompare(right.targetKind) || left.targetId.localeCompare(right.targetId));
}

function rowsWithRevision(rows: Array<{ targetKind: string; targetId: string; revision: string; value: unknown }>) {
  return rows.map(({ targetKind, targetId, revision, value }) => ({ targetKind, targetId, revision, value }))
    .sort((left, right) => left.targetKind.localeCompare(right.targetKind) || left.targetId.localeCompare(right.targetId));
}

function visibleEntries(plan: ReturnType<typeof planImport>) {
  return plan.entries.map(entry => ({
    kind: entry.source.kind,
    sourceId: entry.source.sourceId,
    effects: entry.effects.map(effect => ({
      targetKind: effect.targetKind,
      targetId: effect.targetId,
      value: effect.value,
      ...(effect.expectedRevision ? { expectedRevision: effect.expectedRevision } : {}),
    })),
    unmapped: entry.unmapped,
  }));
}

async function expectRetainedOriginal(jobId: string, context: Parameters<typeof readImportOriginals>[1], expected: any, bytes: Uint8Array) {
  const original = readImportOriginals(jobId, context).find(item => item.name === expected.name);
  assert.ok(original, `missing retained original ${expected.name}`);
  assert.equal(original.sha256, expected.sha256);
  assert.equal(original.size, expected.size);
  assert.deepEqual(original.original, { status: 'retained', base64: Buffer.from(bytes).toString('base64') });
}

test('documented consumer fixture accounts for every source outcome and resumes native apply before undo', async t => {
  const fixture = await loadWorkspaceFixture();
  const directory = await mkdtemp(join(tmpdir(), 'import-consumer-fixture-'));
  const databasePath = join(directory, 'consumer.sqlite');
  let context = openWorkspaceContext(databasePath, fixture.manifest);
  t.after(async () => {
    try { context.storage.close(); } catch { /* A failed test may already have closed it. */ }
    await rm(directory, { recursive: true, force: true });
  });

  assert.equal(fixture.manifest.provenance, 'synthetic');
  assert.equal(fixture.mapping.version, fixture.manifest.mappingVersion);
  assert.deepEqual(fixture.expected.afterUndo, fixture.expected.priorState);
  seedPriorState(context, fixture.expected.priorState);
  const source = await readFileSource({
    namespace: fixture.manifest.namespace,
    name: fixture.manifest.source.name,
    bytes: fixture.sourceBytes,
    format: fixture.manifest.source.format,
    parse: parseWorkspaceRecord,
  });

  assert.equal(source.records.length, fixture.expected.counts.input);
  assert.deepEqual(source.records.map(record => [record.kind, record.sourceId]), [
    ['card', 'card-101'],
    ['card', 'card-102'],
    ['tag-link', 'link-101'],
    ['automation', 'automation-201'],
  ]);
  assert.deepEqual(source.artifacts.map(({ name, sha256, size }) => ({ name, sha256, size })), fixture.expected.sourceArtifacts);
  assert.deepEqual(source.artifacts[0].original, { status: 'available', base64: Buffer.from(fixture.sourceBytes).toString('base64') });
  assert.deepEqual(rowsWithRevision(readPersistedImport(context).rows), fixture.expected.priorState);

  const mappingCalls = { value: 0 };
  const mapping = workspaceMapping(fixture.mapping, fixture.expected.priorState, mappingCalls);
  const plan = planImport(source, mapping, context);
  assert.deepEqual(plan.counts, fixture.expected.counts);
  assert.equal(plan.counts.unique + plan.counts.duplicates, source.records.length);
  assert.equal(plan.entries.length, plan.counts.unique);
  assert.deepEqual(visibleEntries(plan), fixture.expected.entries);
  assert.equal(mappingCalls.value, source.records.length);
  assert.equal(context.storage.database.prepare('SELECT count(*) AS n FROM ik_jobs').get().n, 0);

  const tamperedSource = structuredClone(plan);
  const changedOriginal = Buffer.from(tamperedSource.source.artifacts[0].original!.base64, 'base64');
  const titleOffset = changedOriginal.indexOf('Revised title');
  assert.notEqual(titleOffset, -1);
  changedOriginal[titleOffset] = 'X'.charCodeAt(0);
  tamperedSource.source.artifacts[0].original = { status: 'available', base64: changedOriginal.toString('base64') };
  context.reviewedFingerprint = plan.fingerprint;
  await assert.rejects(createImportJob(tamperedSource, context), /REVIEW_FINGERPRINT_MISMATCH/);

  const tamperedMapping = structuredClone(plan);
  (tamperedMapping.entries[0].effects[0].value as { title: string }).title = 'Changed after review';
  await assert.rejects(createImportJob(tamperedMapping, context), /REVIEW_FINGERPRINT_MISMATCH/);
  assert.equal(context.storage.database.prepare('SELECT count(*) AS n FROM ik_jobs').get().n, 0);

  const job = await createImportJob(plan, context);
  assert.equal(job.state, 'queued');
  await expectRetainedOriginal(job.id, context, fixture.expected.sourceArtifacts[0], fixture.sourceBytes);

  context.maxBatches = 1;
  const firstBatch = await applyImportBatches(job, context);
  assert.equal(firstBatch.state, 'applying');
  assert.equal(firstBatch.checkpoint, 1);
  assert.deepEqual(visibleRows(readPersistedImport(context).rows), fixture.expected.afterFirstBatch);
  assert.equal(context.storage.database.prepare('SELECT count(*) AS n FROM fixture_card_tags WHERE destination=?').get(context.destination).n, 0);

  context.storage.close();
  context = openWorkspaceContext(databasePath, fixture.manifest);
  const callsBeforeResume = mappingCalls.value;
  const completed = await resumeImport(job.id, context);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.checkpoint, fixture.expected.counts.unique);
  assert.equal(mappingCalls.value, callsBeforeResume);
  const persisted = readPersistedImport(context);
  assert.deepEqual(visibleRows(persisted.rows), fixture.expected.afterApply);
  assert.equal(persisted.provenance.length, fixture.expected.counts.effects);
  assert.equal(context.storage.database.prepare('SELECT count(*) AS n FROM fixture_cards WHERE destination=?').get(context.destination).n, 2);
  assert.deepEqual({ ...context.storage.database.prepare('SELECT card_id,label FROM fixture_card_tags WHERE destination=? AND id=?').get(context.destination, 'link-101') }, { card_id: 'card-101', label: 'urgent' });
  const reconciliation = reconcileImport(plan, persisted, context);
  assert.equal(reconciliation.ok, true, JSON.stringify(reconciliation));
  await expectRetainedOriginal(job.id, context, fixture.expected.sourceArtifacts[0], fixture.sourceBytes);

  assert.equal((await undoImport(job.id, context)).state, 'undone');
  const undone = readPersistedImport(context);
  assert.deepEqual(rowsWithRevision(undone.rows), fixture.expected.afterUndo);
  assert.equal(undone.provenance.length, 0);
  assert.equal(context.storage.database.prepare('SELECT count(*) AS n FROM fixture_card_tags WHERE destination=?').get(context.destination).n, 0);
  assert.equal(readImportJob(job.id, context).state, 'undone');
  await expectRetainedOriginal(job.id, context, fixture.expected.sourceArtifacts[0], fixture.sourceBytes);
});
