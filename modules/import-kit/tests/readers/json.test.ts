import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readApiSource, readFileSource } from '../../src/readers/index.ts';
import { apiInput, bytes, code, record } from './helpers.ts';

const file = (text: string) => readFileSource({ namespace: 'source-a', name: 'source.json', bytes: bytes(text), format: 'json', parse: record });

test('duplicate JSON keys reject instead of silently dropping fields or original credential metadata', async () => {
  for (const text of [
    '{"id":"a","id":"b"}',
    '{"id":"a","wrapper":{"next":"https://source.test?token=synthetic-only","next":null}}',
    '{"id":"a","nested":[{"same":1,"s\\u0061me":2}]}',
  ]) await assert.rejects(file(text), code('DUPLICATE_JSON_KEY'));
  await assert.rejects(readApiSource(apiInput({ token: 'synthetic-secret' }), async () => new Response('{"items":[{"id":"a"}],"next":"?token=synthetic-secret","next":null}')), code('DUPLICATE_JSON_KEY'));
});

test('duplicate-key detection permits repeated keys in different objects and structural characters in strings', async () => {
  const input = [{ id: 'a', nested: { id: 'b', strings: ['\\" : , {}[]', { id: 'c' }] } }, { id: 'b', nested: { id: 'd' } }];
  const result = await file(JSON.stringify(input));
  assert.deepEqual(result.records.map(r => r.payload), input);
});
