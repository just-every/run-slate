import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readApiSource } from '../src/readers/index.ts';
import type { ApiPageContext, ApiSourceInput, Json, JsonPathSegment } from '../src/types.ts';
import { bytes, code } from './readers/helpers.ts';

const cells = (path: readonly JsonPathSegment[]) => path.length === 4 && path[0] === 'records' && typeof path[1] === 'number' && path[2] === 'fields' && typeof path[3] === 'string';
function input(extra: Partial<ApiSourceInput> = {}): ApiSourceInput {
  return {
    namespace: 'numeric-source', url: 'https://import.example.test/records',
    preserveNumberLexeme: cells,
    parsePage(value) {
      const page = value as { records: { id: string; fields: Json }[]; next?: string };
      return { records: page.records.map((row, index) => ({ kind: 'row', sourceId: row.id, payload: row.fields, pointer: `/records/${index}` })), next: page.next };
    }, ...extra,
  };
}
const body = (value: string) => `{"records":[{"id":"a","fields":{"amount":${value}}}]}`;
const read = (text: string, extra: Partial<ApiSourceInput> = {}) => readApiSource(input(extra), async () => new Response(text));

test('literal decimals retain distinct exact values, payload hashes and exact artifact custody', async () => {
  const text = '{"records":[{"id":"a","fields":{"amount":0.123456789012345678}},{"id":"b","fields":{"amount":0.123456789012345679}}]}';
  assert.equal(JSON.parse(text).records[0].fields.amount, JSON.parse(text).records[1].fields.amount);
  let requests = 0;
  const result = await readApiSource(input(), async () => { requests++; return new Response(text); });
  assert.equal(requests, 1);
  assert.deepEqual(result.records.map(record => record.payload), [{ amount: '0.123456789012345678' }, { amount: '0.123456789012345679' }]);
  assert.notEqual(result.records[0].payloadHash, result.records[1].payloadHash);
  const artifact = result.artifacts[0];
  assert.deepEqual(artifact.original, { status: 'available', base64: Buffer.from(text).toString('base64') });
  assert.equal(artifact.size, Buffer.byteLength(text));
  assert.equal(artifact.sha256, createHash('sha256').update(text).digest('hex'));
  assert.ok(result.records.every(record => record.artifactHash === artifact.sha256));
});

test('default and unselected finite values preserve number semantics; context is empty', async () => {
  for (const preserveNumberLexeme of [undefined, () => false]) {
    let called = false;
    await read(body('-0'), { preserveNumberLexeme, parsePage(value, page, context) {
      called = true;
      assert.equal(page, 1);
      assert.ok(Object.is((value as any).records[0].fields.amount, -0));
      assert.deepEqual(Object.keys(context.numericLexemes), []);
      assert.ok(Object.isFrozen(context) && Object.isFrozen(context.numericLexemes));
      return { records: [] };
    } });
    assert.ok(called);
    const result = await read(body('0.123456789012345678'), { preserveNumberLexeme });
    assert.deepEqual(result.records[0].payload, { amount: 0.12345678901234568 });
  }
});

test('only direct numeric cells change; decoded paths and pointers handle escaped and prototype keys', async () => {
  const text = String.raw`{"metadata":{"count":2},"records":[{"id":"a","fields":{"plain":42,"string":"42","truth":true,"nothing":null,"list":[9],"nested":{"amount":8},"__proto__":1.00,"constructor":-0,"a/b~c":2E+3,"\u96ea":0.00000000000000000000000000000001,"0":7,"text":"digits 123, braces {}[] and quote \" and backslash \\"}}]}`;
  const paths: JsonPathSegment[][] = [];
  await read(text, {
    preserveNumberLexeme(path) { assert.ok(Object.isFrozen(path)); paths.push([...path]); return cells(path); },
    parsePage(value, _page, context) {
      const page = value as any, fields = page.records[0].fields;
      assert.equal(page.metadata.count, 2);
      assert.equal(fields.plain, '42'); assert.equal(fields.string, '42');
      assert.equal(fields.truth, true); assert.equal(fields.nothing, null);
      assert.deepEqual(fields.list, [9]); assert.deepEqual(fields.nested, { amount: 8 });
      assert.equal(fields.__proto__, '1.00'); assert.equal(fields.constructor, '-0');
      assert.equal(Object.getPrototypeOf(fields), Object.prototype);
      assert.deepEqual({ ...context.numericLexemes }, {
        '/records/0/fields/plain': '42', '/records/0/fields/__proto__': '1.00',
        '/records/0/fields/constructor': '-0', '/records/0/fields/a~1b~0c': '2E+3',
        '/records/0/fields/雪': '0.00000000000000000000000000000001', '/records/0/fields/0': '7',
      });
      assert.equal(Object.getPrototypeOf(context.numericLexemes), null);
      assert.equal(context.numericLexemes['/records/0/fields/string'], undefined);
      assert.deepEqual(Object.keys(context), ['numericLexemes']);
      assert.throws(() => { (context.numericLexemes as Record<string, string>)['/extra'] = '1'; }, TypeError);
      assert.equal(fields.text, JSON.parse(text).records[0].fields.text);
      return { records: [] };
    },
  });
  assert.ok(paths.some(path => path[3] === '雪'));
  assert.ok(paths.some(path => path[3] === 'a/b~c'));
  assert.ok(paths.some(path => path[3] === 'list' && path[4] === 0));
  assert.ok(paths.some(path => path[3] === '0'));
});

test('JSON numeric grammar tokens including huge exponents stay literal only when selected', async () => {
  for (const token of ['0', '-0', '1.2300', '-0.123456789012345678', '1E+09', '1e-7', '9007199254740993', '1e309', '-1e9999999999999999999999999', '0e999999999999999999999']) {
    const result = await read(body(token));
    assert.deepEqual(result.records[0].payload, { amount: token });
  }
  for (const preserveNumberLexeme of [undefined, () => false]) {
    let parsed = false;
    await assert.rejects(read(body('1e309'), { preserveNumberLexeme, parsePage() { parsed = true; return { records: [] }; } }), code('INVALID_OR_CREDENTIAL_SOURCE_DATA'));
    assert.equal(parsed, false);
  }
  await assert.rejects(read('{"metadata":1e309,"records":[]}'), code('INVALID_OR_CREDENTIAL_SOURCE_DATA'));
});

test('root numbers and numeric array items use unambiguous root and index paths', async () => {
  for (const [text, expected, expectedPaths, expectedMap] of [
    ['12.300', '12.300', [[]], { '': '12.300' }],
    ['[1.20,{"0":3e2},"4"]', ['1.20', { '0': '3e2' }, '4'], [[0], [1, '0']], { '/0': '1.20', '/1/0': '3e2' }],
  ] as const) {
    const paths: (readonly JsonPathSegment[])[] = [];
    await read(text, { preserveNumberLexeme(path) { paths.push(path); return true; }, parsePage(value, _page, context) {
      assert.deepEqual(value, expected); assert.deepEqual({ ...context.numericLexemes }, expectedMap); return { records: [] };
    } });
    assert.deepEqual(paths, expectedPaths);
  }
});

test('malformed grammar and duplicate escaped keys reject before either callback', async () => {
  for (const text of [body('01'), body('+1'), body('1.'), body('1e'), body('NaN'), body('Infinity'), body('1,]'), '{"records":[', '{"a":1} trailing', String.raw`{"a":1,"\u0061":2}`, String.raw`{"records":[{"fields":{"a/b":1,"a\u002fb":2}}]}`]) {
    let selected = 0, parsed = 0;
    await assert.rejects(read(text, { preserveNumberLexeme() { selected++; return true; }, parsePage() { parsed++; return { records: [] }; } }));
    assert.equal(selected, 0); assert.equal(parsed, 0);
  }
});

test('ignored credentials, URLs and reflected values reject before selection or parsing', async () => {
  for (const extra of [String.raw`"to\u006ben":"ignored"`, '"ignored":"synthetic-secret"', String.raw`"ignored":"synthetic\u002dsecret"`, '"synthetic-secret":1', '"ignored":"https://source.example.test/?token=ignored"']) {
    let selected = 0, parsed = 0;
    await assert.rejects(read(`{"records":[{"id":"a","fields":{"amount":1e309}}],${extra}}`, {
      token: 'synthetic-secret', preserveNumberLexeme() { selected++; return true; }, parsePage() { parsed++; return { records: [] }; },
    }), error => {
      assert.ok(!String(error).includes('synthetic-secret')); assert.ok(!JSON.stringify(error).includes('synthetic-secret')); return true;
    });
    assert.equal(selected, 0); assert.equal(parsed, 0);
  }
  let selected = 0;
  await assert.rejects(read(body('123456789'), { token: '123456789', preserveNumberLexeme() { selected++; return true; } }), code('CREDENTIAL_IN_SOURCE_DATA'));
  assert.equal(selected, 0);
});

test('policy failures and invalid policies fail closed with safe diagnostics', async () => {
  for (const policy of [() => { throw new Error('synthetic-secret https://private.example.test'); }, () => 'yes', async () => true, async () => { throw new Error('synthetic-secret'); }]) {
    let parsed = false;
    await assert.rejects(read(body('42'), { preserveNumberLexeme: policy as any, parsePage() { parsed = true; return { records: [] }; } }), error => {
      assert.ok(code('SOURCE_NUMBER_POLICY_FAILED')(error));
      assert.ok(!String(error).includes('synthetic-secret')); assert.equal((error as Error).cause, undefined); return true;
    });
    assert.equal(parsed, false);
  }
  await assert.rejects(read(body('42'), { preserveNumberLexeme: true as any }), code('INVALID_API_NUMBER_POLICY'));
});

test('numeric context remains page local with exact originals and repeated field names', async () => {
  const texts = ['{"records":[{"id":"a","fields":{"amount":0.123456789012345678}}],"next":"?page=2"}', body('0.123456789012345679')];
  const contexts: ApiPageContext[] = [];
  let calls = 0;
  const parse = input().parsePage;
  const result = await readApiSource(input({ parsePage(value, page, context) { contexts.push(context); return parse(value, page, context); } }), async () => new Response(texts[calls++]));
  assert.equal(calls, 2); assert.notEqual(contexts[0], contexts[1]);
  assert.equal(contexts[0].numericLexemes['/records/0/fields/amount'], '0.123456789012345678');
  assert.equal(contexts[1].numericLexemes['/records/0/fields/amount'], '0.123456789012345679');
  assert.deepEqual(result.artifacts.map(item => item.original), texts.map(text => ({ status: 'available', base64: Buffer.from(text).toString('base64') })));
  calls = 0;
  await assert.rejects(readApiSource(input(), async () => ++calls === 1 ? new Response(texts[0]) : new Response(null, { status: 500 })), code('SOURCE_HTTP_ERROR'));
  assert.equal(calls, 2);
});

test('single-byte chunks across UTF-8, escapes and exponents preserve tokens and custody', async () => {
  const text = String.raw`{"records":[{"id":"a","fields":{"雪":-1.234567890123456789e-123,"\u0061/b~":1.2300,"text":"123 \" {}"}}]}`;
  const raw = bytes(text); let offset = 0;
  const result = await readApiSource(input(), async () => new Response(new ReadableStream<Uint8Array>({ pull(stream) {
    if (offset < raw.length) stream.enqueue(raw.slice(offset, ++offset)); else stream.close();
  } })));
  assert.deepEqual(result.records[0].payload, { 雪: '-1.234567890123456789e-123', 'a/b~': '1.2300', text: '123 " {}' });
  assert.deepEqual(result.artifacts[0].original, { status: 'available', base64: Buffer.from(raw).toString('base64') });
  let selected = false;
  await assert.rejects(readApiSource(input({ preserveNumberLexeme() { selected = true; return true; } }), async () => new Response(new Uint8Array([123, 34, 255, 34, 58, 49, 125]))));
  assert.equal(selected, false);
});

test('cancellation at number selection and streaming boundaries prevents partial success', async () => {
  const controller = new AbortController(); let parsed = false, calls = 0;
  await assert.rejects(readApiSource(input({ signal: controller.signal, preserveNumberLexeme() { controller.abort('synthetic-secret'); return true; }, parsePage() { parsed = true; return { records: [] }; } }), async () => { calls++; return new Response(body('42')); }), code('SOURCE_CANCELLED'));
  assert.equal(parsed, false); assert.equal(calls, 1);
  const streaming = new AbortController(); let cancelled = false;
  await assert.rejects(readApiSource(input({ signal: streaming.signal }), async () => new Response(new ReadableStream<Uint8Array>({ pull(stream) {
    stream.enqueue(bytes('{"records":[{"id":"a","fields":{"amount":1.2e'));
    streaming.abort('synthetic-secret');
  }, cancel() { cancelled = true; } }, { highWaterMark: 0 }))), code('SOURCE_CANCELLED'));
  assert.equal(cancelled, true);
});

test('preservation remains bounded by byte, record and request limits', async () => {
  await assert.rejects(read(body('42'), { limits: { maxBytes: 10 } }), code('SOURCE_BYTE_LIMIT'));
  await assert.rejects(read(body('0.123456789012345678'), { limits: { maxRecordBytes: 10 } }), code('SOURCE_RECORD_BYTE_LIMIT'));
  await assert.rejects(read('{"records":[{"id":"a","fields":{"n":1}},{"id":"b","fields":{"n":2}}]}', { limits: { maxRecords: 1 } }), code('SOURCE_RECORD_LIMIT'));
  let calls = 0;
  await assert.rejects(readApiSource(input({ maxRequests: 1 }), async () => { calls++; return new Response('{"records":[],"next":"?page=2"}'); }), code('SOURCE_REQUEST_LIMIT'));
  assert.equal(calls, 1);
});
