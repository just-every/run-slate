import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson, jsonStringParts } from '../src/provenance/identity.ts';
import { canonicalChunks, canonicalHash, canonicalSize } from '../src/provenance/canonical-stream.ts';

for (const offset of [-1, 0, 1]) test(`bounded canonical literals retain exact escaping at slice boundary ${offset}`, () => {
  const text = '漢'.repeat((1 << 20) + offset) + '\ud83d\ude00\ud800\u0000\n"\\' + '界'.repeat(300);
  const value = { [text]: [text, '\udc00', -0] };
  const expected = canonicalJson(value), chunks = [...canonicalChunks(value, 64 * 1024)];
  assert.equal([...jsonStringParts(text)].join(''), JSON.stringify(text));
  assert.equal(chunks.join(''), expected);
  assert.ok(chunks.every(chunk => Buffer.byteLength(chunk) <= 64 * 1024));
  assert.equal(canonicalSize(value), Buffer.byteLength(expected));
  assert.equal(canonicalHash(value), createHash('sha256').update(expected).digest('hex'));
});

test('bounded string escaping limits expansion while preserving controls', () => {
  const text = '\u0000'.repeat((1 << 20) + 1), parts = [...jsonStringParts(text)];
  assert.ok(parts.every(part => part.length <= 6 * (1 << 20)));
  assert.equal(parts.join(''), JSON.stringify(text));
});
