import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readApiSource } from '../../src/readers/index.ts';
import { apiInput, bytes, code, jsonResponse } from './helpers.ts';

test('pre-cancelled API reads make no request and redact cancellation reasons', async () => {
  const controller = new AbortController(); controller.abort('synthetic-secret-reason');
  let calls = 0;
  await assert.rejects(readApiSource(apiInput({ signal: controller.signal }), async () => { calls++; return jsonResponse([]); }), error => {
    assert.ok(code('SOURCE_CANCELLED')(error)); assert.ok(!JSON.stringify(error).includes('synthetic-secret-reason')); return true;
  });
  assert.equal(calls, 0);
});

test('cancellation interrupts an uncooperative transport and cancels a late response', { timeout: 2000 }, async () => {
  const controller = new AbortController();
  let resolveResponse: (response: Response) => void = () => {};
  let cancelled = false;
  const work = readApiSource(apiInput({ signal: controller.signal }), async request => {
    assert.equal(request.signal.aborted, false);
    return new Promise<Response>(resolve => { resolveResponse = resolve; });
  });
  controller.abort('synthetic-secret');
  await assert.rejects(work, code('SOURCE_CANCELLED'));
  resolveResponse(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('cancellation interrupts page two body reading and closes it without page three', { timeout: 2000 }, async () => {
  const controller = new AbortController();
  let calls = 0, cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(stream) { stream.enqueue(bytes('{"items":[')); controller.abort('synthetic-secret'); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  await assert.rejects(readApiSource(apiInput({ signal: controller.signal }), async () => ++calls === 1 ? jsonResponse([{ id: 'a' }], '?page=2') : new Response(body)), code('SOURCE_CANCELLED'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2); assert.equal(cancelled, true);
});

test('cancellation interrupts both default rate-limit waits and an uncooperative sleep', { timeout: 2000 }, async () => {
  for (const custom of [false, true]) {
    const controller = new AbortController(); let calls = 0;
    const work = readApiSource(apiInput({ signal: controller.signal, ...(custom ? { sleep: async () => { controller.abort(); return new Promise<void>(() => {}); } } : {}) }), async () => {
      calls++;
      if (!custom) setImmediate(() => controller.abort());
      return new Response(null, { status: 429, headers: { 'retry-after': '20' } });
    });
    await assert.rejects(work, code('SOURCE_CANCELLED'));
    assert.equal(calls, 1);
  }
});

test('cancellation at parser boundary cannot return partial success or request the next page', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(readApiSource(apiInput({ signal: controller.signal, parsePage() { controller.abort(); return { records: [], next: '?page=2' }; } }), async () => { calls++; return jsonResponse([]); }), code('SOURCE_CANCELLED'));
  assert.equal(calls, 1);
});
