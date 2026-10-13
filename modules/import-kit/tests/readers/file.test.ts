import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readFileSource } from '../../src/readers/index.ts';
import type { FileSourceInput, Json } from '../../src/types.ts';
import { bytes, code, record } from './helpers.ts';

const input = (text: string, extra: Partial<FileSourceInput> = {}): FileSourceInput => ({ namespace: 'source-a', name: 'export.json', bytes: bytes(text), format: 'json', parse: record, ...extra });
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

test('reads real file stream with exact bytes, stable hashes, namespace and source locations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'import-reader-'));
  try {
    const text = '\ufeff[{"id":"a","title":"café ☕"}, {"id":"b","kind":"note"}]\n';
    const path = join(dir, 'export.json'); await writeFile(path, text);
    const result = await readFileSource(input('', { bytes: createReadStream(path, { highWaterMark: 1 }) }));
    assert.deepEqual(result.artifacts, [{ name: 'export.json', sha256: hash(text), size: Buffer.byteLength(text), original: { status: 'available', base64: Buffer.from(text).toString('base64') } }]);
    assert.equal(result.records.length, 2);
    assert.deepEqual(result.records[0].location, { artifact: 'export.json', row: 1, pointer: '/0' });
    assert.deepEqual(result.records[1].location, { artifact: 'export.json', row: 2, pointer: '/1' });
    assert.equal(result.records[0].namespace, 'source-a');
    assert.equal(result.records[1].kind, 'note');
    assert.equal(result.records[0].payloadHash, hash('{"id":"a","title":"café ☕"}'));
    assert.equal(result.records[0].artifactHash, hash(text));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('NDJSON incrementally parses split UTF-8 and CRLF, retains physical rows and parser indexes', async () => {
  const text = '\ufeff{"id":"a","text":"日本語"}\r\n\n{"id":"b"}\r\n {"id":"c"}';
  const indexes: number[] = [];
  async function* stream() { for (const byte of bytes(text)) yield new Uint8Array([byte]); }
  const result = await readFileSource(input('', { format: 'ndjson', bytes: stream(), parse(value, index) { indexes.push(index); return record(value); } }));
  assert.deepEqual(indexes, [0, 1, 2]);
  assert.deepEqual(result.records.map(row => row.location.row), [1, 3, 4]);
  assert.equal(result.artifacts[0].sha256, hash(text));
});

test('preserves expansions, custom pointers and duplicates rather than dropping source outcomes', async () => {
  const result = await readFileSource(input('[{"id":"a"},{"id":"a"},{"id":"a","changed":true}]'));
  assert.equal(result.records.length, 3);
  assert.deepEqual(result.diagnostics.map(d => [d.code, d.kind, d.sourceId, d.location?.row]), [
    ['DUPLICATE_SOURCE', 'ticket', 'a', 2], ['DUPLICATE_SOURCE_CONFLICT', 'ticket', 'a', 3],
  ]);
  const expanded = await readFileSource(input('{"id":"a"}', { parse: value => [record(value), { ...record(value), kind: 'original', pointer: '/raw' }] }));
  assert.equal(expanded.records.length, 2);
  assert.equal(expanded.records[1].location.pointer, '/raw');
  await assert.rejects(readFileSource(input('{"id":"a"}', { parse: () => [] })), code('SOURCE_OBJECT_DROPPED'));
});

test('changed original whitespace changes artifact hash while equivalent payload hash stays stable', async () => {
  const a = await readFileSource(input('[{"id":"a"}]'));
  const b = await readFileSource(input('[ { "id" : "a" } ]'));
  assert.notEqual(a.artifacts[0].sha256, b.artifacts[0].sha256);
  assert.equal(a.records[0].payloadHash, b.records[0].payloadHash);
});

test('JSON empty array and blank NDJSON are valid empty sources, empty JSON is malformed', async () => {
  assert.equal((await readFileSource(input('[]'))).records.length, 0);
  assert.equal((await readFileSource(input(' \n', { format: 'ndjson' }))).records.length, 0);
  await assert.rejects(readFileSource(input('')), code('MALFORMED_JSON'));
});

test('malformed bytes and later rows reject the whole source with safe row diagnostics', async () => {
  await assert.rejects(readFileSource(input('', { bytes: new Uint8Array([0xff]) })), code('MALFORMED_UTF8'));
  await assert.rejects(readFileSource(input('{"id":"a"}\n{bad}', { format: 'ndjson' })), error => {
    assert.ok(code('MALFORMED_JSON')(error));
    assert.equal((error as any).diagnostics[0].location.row, 2); return true;
  });
  await assert.rejects(readFileSource(input('{"id":"a"}', { parse: () => { throw new Error('private-source-contents'); } })), error => {
    assert.ok(code('SOURCE_PARSER_FAILED')(error)); assert.ok(!JSON.stringify(error).includes('private-source-contents')); return true;
  });
});

test('byte, input-record, output-record and record count limits are explicit', async () => {
  await assert.rejects(readFileSource(input('[{"id":"a"}]'), { maxBytes: 5 }), code('SOURCE_BYTE_LIMIT'));
  await assert.rejects(readFileSource(input('{"id":"a","text":"long"}'), { maxRecordBytes: 8 }), code('SOURCE_RECORD_BYTE_LIMIT'));
  await assert.rejects(readFileSource(input('[{"id":"a"},{"id":"b"}]'), { maxRecords: 1 }), code('SOURCE_RECORD_LIMIT'));
  await assert.rejects(readFileSource(input('{"id":"a"}', { parse: value => ({ ...record(value), payload: 'x'.repeat(100) }) }), { maxRecordBytes: 90 }), code('SOURCE_RECORD_BYTE_LIMIT'));
  for (const value of [0, -1, Infinity, NaN, 1.2]) await assert.rejects(readFileSource(input('[]'), { maxBytes: value }), code('INVALID_READER_LIMIT'));
});

test('stream failure or parsing/limit failure closes input without pulling later chunks', async () => {
  let pulled = 0, closed = false;
  async function* stream() { try { pulled++; yield bytes('{bad}\n'); pulled++; yield bytes('{"id":"a"}\n'); } finally { closed = true; } }
  await assert.rejects(readFileSource(input('', { format: 'ndjson', bytes: stream() })), code('MALFORMED_JSON'));
  assert.equal(pulled, 1); assert.equal(closed, true);
  async function* broken() { throw new Error('sensitive-file-path'); yield bytes(''); }
  await assert.rejects(readFileSource(input('', { bytes: broken() })), code('SOURCE_READ_FAILED'));
  let returned = false;
  async function* tooLarge() { try { yield bytes('12345'); yield bytes('67890'); } finally { returned = true; } }
  await assert.rejects(readFileSource(input('', { bytes: tooLarge() }), { maxBytes: 2 }), code('SOURCE_BYTE_LIMIT'));
  assert.equal(returned, true);
});

test('rejects credential fields even when a parser attempts to remove them, and rejects invalid parser values', async () => {
  await assert.rejects(readFileSource(input('{"id":"a","access_token":"synthetic-only"}', { parse: () => record({ id: 'a' }) })), code('INVALID_OR_CREDENTIAL_SOURCE_DATA'));
  await assert.rejects(readFileSource(input('{"id":"a"}', { name: 'https://host.test/export?token=synthetic-only' })), code('INVALID_OR_CREDENTIAL_SOURCE_DATA'));
  await assert.rejects(readFileSource(input('{"id":"a"}', { parse: () => ({ kind: '', sourceId: 'a', payload: null }) })), code('INVALID_PARSED_RECORD_ID'));
  await assert.rejects(readFileSource(input('{"id":"a"}', { parse: value => ({ ...record(value), pointer: 'not-a-pointer' }) })), code('INVALID_SOURCE_POINTER'));
  await assert.rejects(readFileSource(input('{"id":"a"}', { parse: value => ({ ...record(value), payload: undefined as unknown as Json }) })), code('INVALID_OR_CREDENTIAL_SOURCE_DATA'));
});

test('detaches parser values so mutation during subsequent calls cannot invalidate prior hashes', async () => {
  const shared = { id: 'first' };
  const result = await readFileSource(input('[1,2]', { parse: (_, index) => { shared.id = String(index); return record(shared); } }));
  assert.deepEqual(result.records.map(r => r.payload), [{ id: '0' }, { id: '1' }]);
});
