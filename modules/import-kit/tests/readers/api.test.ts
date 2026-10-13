import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readApiSource } from '../../src/readers/index.ts';
import { apiInput, bytes, code, jsonResponse } from './helpers.ts';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

test('paginated API binds exact response bytes and keeps credentials in memory across requests', async () => {
  const pages = ['{"items":[{"id":"a"}],"next":"?cursor=abc%2Bdef"}', '{ "items" : [{"id":"b"}] }'];
  const requests: Request[] = [];
  const result = await readApiSource(apiInput({ token: 'synthetic-bearer-value', headers: { 'x-source-version': 'v2' } }), async request => {
    requests.push(request); return new Response(pages[requests.length - 1]);
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, 'https://import.example.test/items?cursor=abc%2Bdef');
  for (const request of requests) {
    assert.equal(request.headers.get('authorization'), 'Bearer synthetic-bearer-value');
    assert.equal(request.headers.get('x-source-version'), 'v2');
    assert.equal(request.redirect, 'manual'); assert.equal(request.credentials, 'omit');
  }
  assert.deepEqual(result.artifacts, pages.map((text, index) => ({ name: `api-page-${index + 1}`, sha256: hash(text), size: Buffer.byteLength(text), original: { status: 'available', base64: Buffer.from(text).toString('base64') } })));
  assert.deepEqual(result.records.map(r => r.location), [{ artifact: 'api-page-1', page: 1 }, { artifact: 'api-page-2', page: 2 }]);
  assert.equal(result.records[1].artifactHash, hash(pages[1]));
  assert.ok(!JSON.stringify(result).includes('synthetic-bearer-value'));
  const otherToken = await readApiSource(apiInput({ token: 'test-different-value' }), async request => new Response(pages[request.url.includes('?') ? 1 : 0]));
  assert.deepEqual(otherToken, result);
});

test('changed response bytes alter artifact identity even when the parser emits identical values', async () => {
  const input = apiInput();
  const a = await readApiSource(input, async () => new Response('{"items":[{"id":"a"}]}'));
  const b = await readApiSource(input, async () => new Response('{"items": [{"id":"a"}]}'));
  assert.notEqual(a.artifacts[0].sha256, b.artifacts[0].sha256);
  assert.equal(a.records[0].payloadHash, b.records[0].payloadHash);
});

test('later-page HTTP, transport and parser failures never return a partial bundle or leak errors', async () => {
  for (const [expected, second] of [
    ['SOURCE_HTTP_ERROR', async () => new Response('private-token-in-body', { status: 500 })],
    ['SOURCE_REQUEST_FAILED', async () => { throw new Error('private-token-in-cause'); }],
    ['MALFORMED_JSON', async () => new Response('private-token-in-json')],
  ] as const) {
    let requests = 0;
    await assert.rejects(readApiSource(apiInput(), async () => ++requests === 1 ? jsonResponse([{ id: 'a' }], '?page=2') : second()), error => {
      assert.ok(code(expected)(error)); assert.ok(!JSON.stringify(error).includes('private-token')); return true;
    });
    assert.equal(requests, 2);
  }
  await assert.rejects(readApiSource(apiInput({ parsePage() { throw new Error('private-token'); } }), async () => jsonResponse([])), code('SOURCE_PARSER_FAILED'));
});

test('preserves cross-page duplicates and conflicting kinds/IDs with exact page diagnostics', async () => {
  let calls = 0;
  const bundle = await readApiSource(apiInput(), async () => ++calls === 1
    ? jsonResponse([{ id: '1', kind: 'ticket' }, { id: '1', kind: 'note' }], '?page=2')
    : jsonResponse([{ id: '1', kind: 'ticket' }, { id: '1', kind: 'note', changed: true }]));
  assert.equal(bundle.records.length, 4);
  assert.deepEqual(bundle.diagnostics.map(d => [d.code, d.kind, d.sourceId, d.location?.page]), [
    ['DUPLICATE_SOURCE', 'ticket', '1', 2], ['DUPLICATE_SOURCE_CONFLICT', 'note', '1', 2],
  ]);
});

test('total byte and record budgets apply across pages, including content-length and actual streamed bytes', async () => {
  const pages = ['{"items":[{"id":"a"}],"next":"?page=2"}', '{"items":[{"id":"b"}]}'];
  for (const limits of [{ maxBytes: Buffer.byteLength(pages[0]) + 3 }, { maxRecords: 1 }]) {
    let calls = 0;
    await assert.rejects(readApiSource(apiInput({ limits }), async () => new Response(pages[calls++])), code('maxBytes' in limits ? 'SOURCE_BYTE_LIMIT' : 'SOURCE_RECORD_LIMIT'));
    assert.equal(calls, 2);
  }
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(bytes('12345')); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(readApiSource(apiInput({ limits: { maxBytes: 3 } }), async () => new Response(body)), code('SOURCE_BYTE_LIMIT'));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, true);
  await assert.rejects(readApiSource(apiInput({ limits: { maxBytes: 3 } }), async () => new Response('{}', { headers: { 'content-length': '99' } })), code('SOURCE_BYTE_LIMIT'));
});

test('API sequential consumption applies backpressure before fetching the next page', async () => {
  const events: string[] = [];
  const chunks = ['{"items":[', '{"id":"a"}],', '"next":"?page=2"}'];
  let calls = 0, index = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    events.push(`pull-${index}`);
    if (index < chunks.length) controller.enqueue(bytes(chunks[index++])); else controller.close();
  } }, { highWaterMark: 0 });
  await readApiSource(apiInput(), async () => {
    events.push(`request-${++calls}`); return calls === 1 ? new Response(stream) : jsonResponse([{ id: 'b' }]);
  });
  assert.deepEqual(events, ['request-1', 'pull-0', 'pull-1', 'pull-2', 'pull-3', 'request-2']);
});

test('pagination/request bounds and malformed next links are explicit', async () => {
  let calls = 0;
  await assert.rejects(readApiSource(apiInput({ maxRequests: 2 }), async () => jsonResponse([], `?page=${++calls}`)), code('SOURCE_REQUEST_LIMIT'));
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(readApiSource(apiInput(), async () => { calls++; return jsonResponse([], '/items'); }), code('SOURCE_PAGINATION_CYCLE'));
  assert.equal(calls, 1);
  await assert.rejects(readApiSource(apiInput({ parsePage: () => ({ records: [], next: '' }) }), async () => jsonResponse([])), code('INVALID_NEXT_PAGE'));
  await assert.rejects(readApiSource(apiInput({ maxRequests: 0 }), async () => jsonResponse([])), code('INVALID_API_LIMIT'));
});
