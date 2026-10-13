import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { readApiSource, readFileSource, planImport, createImportJob, applyImportBatches, readImportOriginals, openSqliteImportStorage, readPersistedImport, reconcileImport } from '../../src/index.ts';
import { sqliteRuntime } from '../d1/sqlite-runtime.ts';
import { planD1Import, createD1ImportJob, resumeD1Import, readD1ImportOriginals, planD1ImportStream, createD1ImportStream, resumeD1ImportStream } from '../../src/d1/index.ts';
import type { ApiSourceInput, ImportContext, ImportMapping, Json, ParsedRecord, SourceBundle } from '../../src/types.ts';

// Synthetic values, official documented envelope and pagination URL shape:
// https://developer.calendly.com/api-docs/calendly-api/event-types/list-event-types
const endpoint = 'https://api.calendly.com/event_types';
const token = 'synthetic-memory-only-auth';
const paginationCursorPolicy = 'page-token-v1' as const;
const parse = (value: Json): ParsedRecord => ({ kind: 'event_type', sourceId: (value as any).collection[0].uri, payload: value });
const page = (id: string, next: string | null) => Buffer.from(JSON.stringify({
  collection: [{ uri: `${endpoint}/${id}`, name: 'Meeting', secret: false }],
  pagination: { count: 1, next_page: next, previous_page: null, next_page_token: next ? 'cursor/a+b' : null, previous_page_token: null },
}, null, 2) + '\n');
const input = (changes: Partial<ApiSourceInput> = {}): ApiSourceInput => ({ namespace: 'archive', url: endpoint, token, paginationCursorPolicy,
  parsePage: value => ({ records: [parse(value)], next: (value as any).pagination.next_page }), ...changes });

test('trusted page-token policy preserves exact API/export originals through public custody and rejects credential escapes', async t => {
  const cursors = ['cursor%2Fa%2Bb', ...['token', 'secret', 'auth'].flatMap(key => [
    `cursor%26${key}%3Dposition`, `cursor%2526${key}%253Dposition`,
    `cursor%26${key}=position`, `cursor%3f${key}%3dposition`,
  ])];
  const links = cursors.map(cursor => `${endpoint}?count=1&page_token=${cursor}&limit=1`);
  const pages = [...links, null].map((next, index) => page(String(index), next));
  const paths = [endpoint, ...links].map(url => new URL(url).pathname + new URL(url).search);
  const directory = await mkdtemp(join(tmpdir(), 'import-pagination-policy-'));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    if (request.url === '/redirect') { response.writeHead(307, { location: links[0] }); response.end(); return; }
    response.setHeader('content-type', 'application/json');
    const index = paths.indexOf(request.url!);
    assert.ok(index >= 0);
    response.end(pages[index]);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Only the test network edge maps the requested provider URL to local replay.
  // Production reader still sees exact official-shaped request/response URLs.
  const replay = async (request: Request) => {
    assert.equal(new URL(request.url).origin, 'https://api.calendly.com');
    assert.equal(request.redirect, 'manual');
    const url = new URL(request.url);
    const response = await fetch(new Request(local + url.pathname + url.search, request));
    const result = new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
    Object.defineProperty(result, 'url', { value: request.url });
    return result;
  };
  try {
    const api = await readApiSource(input({ parsePage: value => ({ records: [{ ...parse(value), payload: (value as any).collection[0] }], next: (value as any).pagination.next_page }) }), replay);
    assert.deepEqual(requests, paths);
    assert.equal((await readApiSource(input({ url: 'https://api.calendly.com/redirect' }), replay)).records.length, pages.length - 1);
    for (const url of links) {
      const seen: string[] = [];
      await readApiSource(input({ url }), async request => {
        seen.push(request.url);
        const response = new Response(pages.at(-1));
        Object.defineProperty(response, 'url', { value: request.url });
        return response;
      });
      assert.deepEqual(seen, [url]);
    }
    const saved: SourceBundle = { records: [], artifacts: [], diagnostics: [], paginationCursorPolicy };
    for (const [index, bytes] of pages.entries()) {
      const name = `export-${index}.json`, filename = join(directory, name);
      await writeFile(filename, bytes);
      const file = await readFileSource({ namespace: 'archive', name, bytes: await readFile(filename), format: 'json', paginationCursorPolicy, parse });
      saved.records.push(...file.records); saved.artifacts.push(...file.artifacts); saved.diagnostics.push(...file.diagnostics);
      await assert.rejects(readFileSource({ namespace: 'archive', name, bytes: pages[0], format: 'json', parse }));
    }
    const mapping: ImportMapping = { version: 'v1', map: record => ({ effects: [{ targetKind: 'event_type', targetId: record.sourceId, value: (record.payload as any).collection?.[0] ?? record.payload }] }) };
    for (const [index, source] of [api, saved].entries()) {
      const storage = openSqliteImportStorage(join(directory, `import-${index}.sqlite`));
      try {
        const context: ImportContext = { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', storage, authorization: { principalId: 'owner', assertAuthorized() {} } };
        const { paginationCursorPolicy: omitted, ...strictSource } = source;
        assert.throws(() => planImport(strictSource, mapping, context), /CREDENTIAL/);
        for (const badPolicy of [null, false, true, '', 'page_token', ['page_token'], { allow: ['token'] }]) {
          assert.throws(() => planImport({ ...source, paginationCursorPolicy: badPolicy as any }, mapping, context), /INVALID_PAGINATION_CURSOR_POLICY/);
        }
        assert.throws(() => planImport(source, { version: 'v1', map: record => ({ effects: [{ targetKind: 'event_type', targetId: record.sourceId, value: { url: endpoint + '?page_token=cursor' } }] }) }, context), /CREDENTIAL/);
        const plan = planImport(source, mapping, context);
        const reviewed = { ...context, reviewedFingerprint: plan.fingerprint };
        const changedPolicy = structuredClone(plan); delete changedPolicy.source.paginationCursorPolicy;
        await assert.rejects(createImportJob(changedPolicy, reviewed), /REVIEW_FINGERPRINT_MISMATCH/);
        const job = await createImportJob(plan, reviewed);
        assert.equal((await applyImportBatches(job, reviewed)).state, 'completed');
        assert.equal(reconcileImport(plan, readPersistedImport(reviewed), reviewed).ok, true);
        const originals = readImportOriginals(job.id, reviewed);
        assert.equal(originals.length, pages.length);
        for (const [pageIndex, original] of originals.entries()) {
          assert.equal(original.original.status, 'retained');
          if (original.original.status === 'retained') assert.deepEqual(Buffer.from(original.original.base64, 'base64'), pages[pageIndex]);
        }
      } finally { storage.close(); }
      const runtime = await sqliteRuntime(t);
      const context = { ...runtime.context(), ...(index ? { maxBatchBytes: 2 * 1024 * 1024 } : {}) };
      const plan = await planD1Import(source, mapping, context);
      const job = await createD1ImportJob(plan, { ...context, reviewedFingerprint: plan.fingerprint });
      assert.equal((await resumeD1Import(job.id, context)).state, 'completed');
      const originals = await readD1ImportOriginals(job.id, context);
      assert.equal(originals.length, pages.length);
      for (const [pageIndex, original] of originals.entries()) {
        assert.equal(original.original.status, 'retained');
        if (original.original.status === 'retained') assert.deepEqual(Buffer.from(original.original.base64, 'base64'), pages[pageIndex]);
      }
    }
    // Normalized stream planning must carry the same trusted source policy.
    // Raw originals have already been proved above; streams require metadata-only artifacts.
    const normalized = { ...saved, artifacts: saved.artifacts.map(({ original, ...artifact }) => artifact) };
    const streamed = await sqliteRuntime(t), streamContext = streamed.context();
    const streamPlan = await planD1ImportStream(normalized, mapping, streamContext);
    const streamJob = await createD1ImportStream(streamPlan, { ...streamContext, reviewedFingerprint: streamPlan.fingerprint });
    let streamState = streamJob.state;
    for (let step = 0; step < pages.length && streamState !== 'completed'; step++) streamState = (await resumeD1ImportStream(streamJob.id, streamContext)).state;
    assert.equal(streamState, 'completed');
    assert.equal((await streamContext.storage.targets.list(streamed.db(), 'workspace')).length, pages.length);
    await assert.rejects(readApiSource(input({ paginationCursorPolicy: undefined }), replay));
    let calls = 0;
    for (const badPolicy of [null, false, true, '', 'page_token', ['page_token'], { allow: ['token'] }]) {
      await assert.rejects(readApiSource(input({ paginationCursorPolicy: badPolicy as any }), async () => { calls++; return new Response(pages[0]); }), /INVALID_PAGINATION_CURSOR_POLICY/);
      await assert.rejects(readFileSource({ namespace: 'archive', name: 'export.json', bytes: pages[0], format: 'json', paginationCursorPolicy: badPolicy as any, parse }), /INVALID_PAGINATION_CURSOR_POLICY/);
    }
    assert.equal(calls, 0);
    const forbidden = ['token', 'password', 'secret', 'access_token', '%61ccess_token', '%2561ccess_token', '%70age_token', 'PAGE_TOKEN', 'page%255Ftoken', '%' + '25'.repeat(40) + '61ccess_token'];
    const urls = [
      ...forbidden.map(key => `${endpoint}?${key}=anything`),
      ...['token', 'secret', 'auth'].flatMap(key => [
        `${endpoint}?page_token=cursor%26${key}%3Dposition&${key}=anything`,
        `${endpoint}?count=1%2526${key}%253Danything&page_token=cursor%26${key}%3Dposition`,
        `${endpoint}?count=1%23fragment%26${key}%3Danything&page_token=cursor%26${key}%3Dposition`,
        `${endpoint}%3F${key}%3Danything?page_token=cursor%26${key}%3Dposition`,
        `${endpoint}?page_token=${encodeURIComponent(`${endpoint}?${key}=anything`)}`,
      ]),
      `${endpoint}?page_token=${encodeURIComponent('https://user:pass@api.calendly.com/event_types')}`,
      `${endpoint}?page_token=${token}`, `${endpoint}?page_token=synthetic%252Dmemory%252Donly%252Dauth`,
      'https://user:pass@api.calendly.com/event_types',
    ];
    for (const url of urls) {
      let initial = 0;
      await assert.rejects(readApiSource(input({ url }), async () => { initial++; return new Response(pages.at(-1)); }));
      assert.equal(initial, 0);
      for (const redirect of [false, true]) {
        let sent = 0;
        await assert.rejects(readApiSource(input(), async () => { sent++; return redirect ? new Response(null, { status: 302, headers: { location: url } }) : new Response(page('a', url)); }));
        assert.equal(sent, 1);
      }
      // Unknown auth values still cannot use any forbidden query spelling in saved files.
      if (!url.includes(token) && !url.includes('synthetic%')) await assert.rejects(readFileSource({ namespace: 'archive', name: 'bad.json', bytes: page('a', url), format: 'json', paginationCursorPolicy, parse }));
    }
    for (const url of ['https://other.test/events?page_token=cursor', '//other.test/events?page_token=cursor']) {
      for (const redirect of [false, true]) {
        let sent = 0;
        await assert.rejects(readApiSource(input(), async () => { sent++; return redirect ? new Response(null, { status: 302, headers: { location: url } }) : new Response(page('a', url)); }), /CROSS_ORIGIN_SOURCE_URL/);
        assert.equal(sent, 1);
      }
    }
    for (const field of ['token', 'password', 'secret', 'access_token', '%2561ccess_token']) {
      const raw = Buffer.from(JSON.stringify({ collection: [{ uri: 'a' }], [field]: 'unprovided-secret' }));
      await assert.rejects(readApiSource(input({ parsePage: () => ({ records: [] }) }), async () => new Response(raw)));
      await assert.rejects(readFileSource({ namespace: 'archive', name: 'bad.json', bytes: raw, format: 'json', paginationCursorPolicy, parse }));
    }
    for (const reflected of [token, 'synthetic%252Dmemory%252Donly%252Dauth']) {
      const raw = page('a', null).toString().replace('"next_page_token": null', `"next_page_token": "${reflected}"`);
      await assert.rejects(readApiSource(input({ parsePage: () => ({ records: [] }) }), async () => new Response(raw)), /CREDENTIAL_IN_SOURCE_DATA/);
    }
    for (const name of await readdir(directory)) assert.ok(!(await readFile(join(directory, name))).includes(Buffer.from(token)));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
