import test from 'node:test';
import assert from 'node:assert/strict';
import { StringSizeCache, canonicalJsonBytes } from '../src/plan/size.ts';
import { canonicalJson } from '../src/provenance/identity.ts';

test('shared string size cache preserves fresh property reads, mutation, and exact distinct-value sizes', () => {
  const cache = new StringSizeCache(); let reads = 0, text = '漢'.repeat(256);
  const value = { get answer() { reads++; return text; } };
  assert.equal(canonicalJsonBytes(value, undefined, cache), Buffer.byteLength(canonicalJson({ answer: text })));
  text = '\ud800\u0000"\\';
  assert.equal(canonicalJsonBytes(value, undefined, cache), Buffer.byteLength(canonicalJson({ answer: text })));
  assert.equal(reads, 2);
  for (let i = 0; i < 5000; i++) {
    const value = { ['field' + i]: '界'.repeat(256) + i };
    assert.equal(canonicalJsonBytes(value, undefined, cache), Buffer.byteLength(canonicalJson(value)));
  }
  const large = '漢'.repeat(600_000);
  assert.equal(canonicalJsonBytes(large, undefined, cache), Buffer.byteLength(canonicalJson(large)));
});
