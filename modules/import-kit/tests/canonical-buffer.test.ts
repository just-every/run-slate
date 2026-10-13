import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalHash } from '../src/provenance/canonical-stream.ts';

// Independent recursive text oracle: it deliberately uses neither the byte
// writer, its cache, nor the production canonical serializer.
const oracle = (value: any): string => {
  if (Array.isArray(value)) return `[${value.map(oracle).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${oracle(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const expected = (value: unknown) => createHash('sha256').update(oracle(value)).digest('hex');

test('buffer boundaries preserve every canonical UTF-8 byte and JSON type', () => {
  const special = Object.assign(Object.create(null), { '2': 2, '10': '10', constructor: false, empty: '', '__proto__': null });
  Object.defineProperty(special, '__proto__', { value: ['漢', '😀', 'e\u0301', '\ud800', '\udfff', '\u0000\n\\"'], enumerable: true });
  for (const length of [65531, 65535, 65536, 65537, 1048575, 1048576, 1048577]) {
    const value = [special, 'a'.repeat(length), '😀漢'.repeat(Math.ceil(length / 3)), null, true, false, -0, 0.25, 1e21, [], {}];
    assert.equal(canonicalHash(value), expected(value));
  }
  const escapes = ['prefix', '"\n\\😀\ud800'.repeat(200000), 'after'];
  assert.equal(canonicalHash(escapes), expected(escapes));
});

test('distinct strings and later repeats remain exact across both cache bounds', () => {
  for (const width of [8, 400]) {
    const unique = Array.from({ length: 5000 }, (_, index) => `${index}:` + String.fromCharCode(0x4e00 + index).repeat(width));
    const value = [unique, unique.slice().reverse(), { value: unique[0], another: unique.at(-1) }];
    assert.equal(canonicalHash(value), expected(value));
    assert.equal(canonicalHash({ replacement: value }), expected({ replacement: value }));
  }
});

test('hashing always rereads containers and refuses invalid values after cached strings', () => {
  let reads = 0;
  const changing = { get value() { return ++reads; } };
  assert.equal(canonicalHash([changing, changing]), expected([{ value: 1 }, { value: 2 }]));
  assert.equal(reads, 2);
  assert.equal(canonicalHash(changing), expected({ value: 3 }));
  const strings = Array.from({ length: 5000 }, (_, index) => `literal-${index}`);
  for (const invalid of [undefined, NaN, Infinity, -Infinity, new Date(0), new Uint8Array(1), () => 0, Array(1)]) {
    assert.throws(() => canonicalHash([strings, invalid]), /INVALID_JSON/);
  }
});
