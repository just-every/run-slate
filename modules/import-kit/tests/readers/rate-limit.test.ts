import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readApiSource } from '../../src/readers/index.ts';
import { apiInput, code, jsonResponse } from './helpers.ts';

test('page two honors Retry-After before retrying the identical URL with credentials intact', async () => {
  const events: string[] = [], urls: string[] = [];
  const result = await readApiSource(apiInput({ token: 'synthetic-memory-token', sleep: async ms => { events.push(`wait-${ms}`); } }), async request => {
    urls.push(request.url); events.push(`request-${urls.length}`);
    assert.equal(request.headers.get('authorization'), 'Bearer synthetic-memory-token');
    if (urls.length === 1) return jsonResponse([{ id: 'a' }], '?cursor=second');
    if (urls.length === 2) return new Response(null, { status: 429, headers: { 'retry-after': '2' } });
    return jsonResponse([{ id: 'b' }]);
  });
  assert.equal(result.records.length, 2);
  assert.equal(result.artifacts.length, 2);
  assert.equal(urls[1], urls[2]);
  assert.deepEqual(events, ['request-1', 'request-2', 'wait-2000', 'request-3']);
});

test('rate retry budgets are bounded, including requests used by retries', async () => {
  let calls = 0;
  const waits: number[] = [];
  await assert.rejects(readApiSource(apiInput({ maxRetries: 2, sleep: async ms => { waits.push(ms); } }), async () => { calls++; return new Response(null, { status: 429 }); }), code('SOURCE_RATE_LIMIT'));
  assert.equal(calls, 3); assert.deepEqual(waits, [1000, 2000]);
  calls = 0;
  await assert.rejects(readApiSource(apiInput({ maxRequests: 1, sleep: async () => {} }), async () => { calls++; return new Response(null, { status: 429, headers: { 'retry-after': '0' } }); }), code('SOURCE_REQUEST_LIMIT'));
  assert.equal(calls, 1);
});

test('oversized and malformed Retry-After fail without early retries or sleeping', async () => {
  for (const [header, expected] of [['99999', 'RETRY_AFTER_LIMIT'], ['nonsense', 'INVALID_RETRY_AFTER'], ['-1', 'INVALID_RETRY_AFTER']]) {
    let calls = 0, sleeps = 0;
    await assert.rejects(readApiSource(apiInput({ sleep: async () => { sleeps++; } }), async () => { calls++; return new Response(null, { status: 429, headers: { 'retry-after': header } }); }), code(expected));
    assert.equal(calls, 1); assert.equal(sleeps, 0);
  }
});

test('HTTP date, fractional seconds and temporary service rate limits are honored', async () => {
  for (const [status, header, expected] of [[429, 'Thu, 01 Jan 1970 00:00:00 GMT', 0], [503, '0.125', 125], [403, '0', 0]] as const) {
    const waits: number[] = []; let calls = 0;
    await readApiSource(apiInput({ sleep: async ms => { waits.push(ms); } }), async () => ++calls === 1
      ? new Response(null, { status, headers: { 'retry-after': header } }) : jsonResponse([]));
    assert.deepEqual(waits, [expected]); assert.equal(calls, 2);
  }
});
