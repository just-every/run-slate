import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readApiSource, readFileSource } from '../../src/readers/index.ts';
import type { SourceArtifact } from '../../src/types.ts';
import { apiInput, bytes, code, record } from './helpers.ts';

function exactOriginal(artifact: SourceArtifact, expected: Uint8Array): void {
  assert.equal(artifact.original?.status, 'available');
  if (artifact.original?.status !== 'available') assert.fail('Missing original bytes');
  const decoded = Buffer.from(artifact.original.base64, 'base64');
  assert.deepEqual(decoded, Buffer.from(expected));
  assert.equal(decoded.toString('base64'), artifact.original.base64);
  assert.equal(artifact.size, expected.byteLength);
  assert.equal(artifact.sha256, createHash('sha256').update(expected).digest('hex'));
}

test('file custody preserves exact BOM, whitespace, line endings and parser-excluded envelope bytes', async () => {
  const text = '\ufeff{\r\n "metadata": {"exportVersion":"2", "untouched":[1,2]},\r\n "items": [{"id":"a"}]\r\n}\t\r\n';
  const result = await readFileSource({ namespace: 'source-a', name: 'original.json', format: 'json', bytes: bytes(text), parse: value => (value as any).items.map(record) });
  assert.deepEqual(result.records[0].payload, { id: 'a' });
  exactOriginal(result.artifacts[0], bytes(text));
});

test('NDJSON custody preserves empty lines and exact stream bytes including reused chunk buffers', async () => {
  const original = bytes('\ufeff{"id":"a"}\r\n\r\n {"id":"b"}\t\n');
  const buffer = new Uint8Array(1);
  async function* stream() { for (const value of original) { buffer[0] = value; yield buffer; } buffer[0] = 0; }
  const result = await readFileSource({ namespace: 'source-a', name: 'original.ndjson', format: 'ndjson', bytes: stream(), parse: record });
  exactOriginal(result.artifacts[0], original);
  assert.equal(result.records.length, 2);
});

test('API retains every exact successful page including unmapped envelope fields and formatting', async () => {
  const texts = ['\ufeff {"version":1,"items":[{"id":"a"}],"next":"?page=2"}\r\n', '{\n"metadata": {"count": 1}, "items":[{"id":"b"}] }\n'];
  let calls = 0;
  const result = await readApiSource(apiInput({ token: 'synthetic-private-credential' }), async () => new Response(texts[calls++]));
  result.artifacts.forEach((artifact, index) => exactOriginal(artifact, bytes(texts[index])));
  assert.ok(!JSON.stringify(result).includes('synthetic-private-credential'));
});

test('empty sources and multi-block originals have canonical complete custody without unused bytes', async () => {
  for (const text of ['', '\n'.repeat(64 * 1024 + 19)]) {
    const result = await readFileSource({ namespace: 'source-a', name: 'empty.ndjson', format: 'ndjson', bytes: bytes(text), parse: record });
    exactOriginal(result.artifacts[0], bytes(text));
  }
});

test('parser-excluded credential envelopes reject rather than retaining or redacting originals', async () => {
  await assert.rejects(readFileSource({ namespace: 'source-a', name: 'source.json', format: 'json', bytes: bytes('{"items":[{"id":"a"}],"access_token":"synthetic-only"}'), parse: value => (value as any).items.map(record) }), code('INVALID_OR_CREDENTIAL_SOURCE_DATA'));
  await assert.rejects(readApiSource(apiInput(), async () => new Response('{"items":[],"metadata":{"refresh_token":"synthetic-only"}}')), code('INVALID_OR_CREDENTIAL_SOURCE_DATA'));
});
