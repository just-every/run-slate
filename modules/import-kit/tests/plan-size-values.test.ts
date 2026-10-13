import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/provenance/identity.ts';
import { canonicalJsonBytes } from '../src/plan/size.ts';

test('byte counting includes every control escape, escaped/surrogate keys and repeated references', () => {
  const controls = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('');
  const shared = { ['"\\' + controls + '\ud800🌱\udc00']: [controls, -0, 1e-7, 1e21, Number.MIN_VALUE, Number.MAX_VALUE, null, false] };
  const value = [shared, { nested: shared }, shared];
  assert.equal(canonicalJsonBytes(value), Buffer.byteLength(canonicalJson(value)));
  assert.equal(canonicalJsonBytes({ fingerprint: 'omit', nested: { fingerprint: 'keep' } }, 'fingerprint'), Buffer.byteLength('{"nested":{"fingerprint":"keep"}}'));
});

test('counting refuses cyclic, excessive nesting and unsafe integer sizes deterministically', () => {
  const cycle: any = {}; cycle.self = cycle;
  assert.throws(() => canonicalJsonBytes(cycle), /INVALID_JSON/);
  let deep: unknown = null;
  for (let i = 0; i < 10_000; i++) deep = [deep];
  assert.throws(() => canonicalJsonBytes(deep), /INVALID_JSON/);
  let repeated: unknown = 'x';
  for (let i = 0; i < 54; i++) repeated = [repeated, repeated];
  assert.throws(() => canonicalJsonBytes(repeated), /INVALID_JSON: canonical byte size exceeds safe integer range/);
});
