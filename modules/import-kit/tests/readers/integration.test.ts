import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { applyImportBatches, createImportJob, openSqliteImportStorage, planImport, readPersistedImport, reconcileImport } from '../../src/index.ts';
import { readApiSource, readFileSource, ReaderError } from '../../src/readers/index.ts';
import type { ImportContext, ImportMapping } from '../../src/types.ts';
import { apiInput, bytes, code, jsonResponse, record } from './helpers.ts';

test('reader bundles pass frozen core planning/apply/reconciliation, and database never retains bearer tokens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'import-reader-core-'));
  const filename = join(directory, 'import.sqlite');
  const storage = openSqliteImportStorage(filename);
  try {
    const context: ImportContext = { destination: 'workspace', namespace: 'source-a', mappingVersion: 'v1', storage, authorization: { principalId: 'owner', assertAuthorized() {} } };
    const mapping: ImportMapping = { version: 'v1', map: source => ({ effects: [{ targetKind: source.kind, targetId: source.sourceId, value: source.payload }] }) };
    const bundle = await readApiSource(apiInput({ token: 'synthetic-memory-only-credential' }), async () => jsonResponse([{ id: 'a' }, { id: 'a' }]));
    const plan = planImport(bundle, mapping, context);
    assert.equal(plan.counts.duplicates, 1); assert.equal(plan.counts.unique, 1);
    const reviewed = { ...context, reviewedFingerprint: plan.fingerprint };
    const job = await createImportJob(plan, reviewed);
    assert.equal((await applyImportBatches(job, reviewed)).state, 'completed');
    const persisted = readPersistedImport(reviewed);
    assert.equal(persisted.provenance[0].artifactHash, bundle.artifacts[0].sha256);
    assert.deepEqual(persisted.provenance[0].location, bundle.records[0].location);
    assert.equal(reconcileImport(plan, persisted, reviewed).ok, true);
    for (const name of await readdir(directory)) assert.ok(!(await readFile(join(directory, name))).includes(Buffer.from('synthetic-memory-only-credential')));
    const changed = await readFileSource({ namespace: 'source-a', name: 'changed.json', format: 'json', bytes: bytes('[{"id":"a","changed":true}]'), parse: record });
    const changedPlan = planImport(changed, mapping, context);
    assert.notEqual(changedPlan.fingerprint, plan.fingerprint);
    const changedContext = { ...context, reviewedFingerprint: changedPlan.fingerprint };
    const changedJob = await createImportJob(changedPlan, changedContext);
    await assert.rejects(applyImportBatches(changedJob, changedContext), /SOURCE_ID_CONTENT_CONFLICT/);
    assert.deepEqual(readPersistedImport(context).rows[0].value, { id: 'a' });
    const conflicting = await readFileSource({ namespace: 'source-a', name: 'duplicate.json', format: 'json', bytes: bytes('[{"id":"a"},{"id":"a","changed":true}]'), parse: record });
    assert.throws(() => planImport(conflicting, mapping, context), /DUPLICATE_SOURCE_CONFLICT/);
  } finally { storage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('actual fetch follows same-origin redirects manually and reads both streamed pages', async () => {
  const received: { url: string; authorization: string | undefined }[] = [];
  const server = createServer((request, response) => {
    received.push({ url: request.url!, authorization: request.headers.authorization });
    if (request.url === '/start') { response.writeHead(302, { location: '/items' }); response.end(); }
    else if (request.url === '/items') { response.writeHead(200, { 'content-type': 'application/json' }); response.write('{"items":[{"id":"a"}],'); response.end('"next":"?page=2"}'); }
    else { response.end('{"items":[{"id":"b"}]}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await readApiSource(apiInput({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/start`, token: 'synthetic-http-credential' }), fetch);
    assert.deepEqual(result.records.map(r => r.sourceId), ['a', 'b']);
    assert.deepEqual(received.map(r => r.url), ['/start', '/items', '/items?page=2']);
    assert.ok(received.every(r => r.authorization === 'Bearer synthetic-http-credential'));
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('external streams cannot inject token-bearing ReaderError diagnostics', async () => {
  async function* broken() { throw new ReaderError('synthetic-secret'); yield bytes(''); }
  await assert.rejects(readFileSource({ namespace: 'source-a', name: 'source.json', format: 'json', bytes: broken(), parse: record }), code('SOURCE_READ_FAILED'));
});
