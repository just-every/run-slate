import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanonicalHasher } from '../src/provenance/canonical-hash.ts';

const oracle = (value: any): string => Array.isArray(value)
  ? `[${Array.from({ length: value.length }, (_, index) => oracle(value[index])).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${oracle(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const expected = (value: unknown) => createHash('sha256').update(oracle(value)).digest('hex');

test('one operation reuses immutable encodings but rereads every payload and releases bytes', t => {
  const encode = TextEncoder.prototype.encode, allocations: Uint8Array[] = [];
  t.mock.method(TextEncoder.prototype, 'encode', function(this: TextEncoder, text: string) {
    const bytes = encode.call(this, text); allocations.push(bytes); return bytes;
  });
  const hasher = createCanonicalHasher(), statement = '漢😀\\"\n\ud800'.repeat(40);
  let reads = 0;
  const changing = { get accepted() { return ++reads % 2 === 1; }, statement };
  try {
    assert.equal(hasher.hash(changing), expected({ accepted: true, statement }));
    const firstAllocations = allocations.length;
    assert.equal(hasher.hash(changing), expected({ accepted: false, statement }));
    assert.equal(allocations.length, firstAllocations);
    assert.equal(reads, 2);
    const hostile = JSON.parse('{"__proto__":{"constructor":"own"},"10":-0,"2":[null,false,"\\udfff"]}');
    assert.equal(hasher.hash(hostile), expected(hostile));
    const custom = { value: statement, toJSON() { return 'changed'; } };
    assert.throws(() => hasher.hash(custom), /INVALID_JSON/);
    for (const invalid of [undefined, NaN, Infinity, new Date(0), new Uint8Array(1), Array(1)])
      assert.throws(() => hasher.hash([statement, invalid]), /INVALID_JSON/);
    const nested = { before: statement, get middle() { return hasher.hash([statement]); }, after: true };
    assert.equal(hasher.hash(nested), expected({ before: statement, middle: expected([statement]), after: true }));
  } finally { hasher.clear(); }
  assert.ok(allocations.length > 0);
  assert.ok(allocations.every(bytes => bytes.every(byte => byte === 0)));
  const oldCount = allocations.length;
  assert.equal(hasher.hash(statement), expected(statement));
  assert.ok(allocations.length > oldCount, 'cleared encodings must be rebuilt');
  hasher.clear();
});

test('operation cache preserves the entry and encoded-byte bounds across separate calls', t => {
  const encode = TextEncoder.prototype.encode, allocations: Uint8Array[] = [];
  t.mock.method(TextEncoder.prototype, 'encode', function(this: TextEncoder, text: string) {
    const bytes = encode.call(this, text); allocations.push(bytes); return bytes;
  });
  for (const width of [1, 400]) {
    const hasher = createCanonicalHasher(); allocations.length = 0;
    try {
      for (let index = 0; index < 5000; index++) {
        const value = `${index}:` + '漢'.repeat(width);
        assert.equal(hasher.hash(value), expected(value));
      }
      assert.ok(allocations.length <= 4096);
      assert.ok(allocations.reduce((sum, bytes) => sum + bytes.length, 0) <= 1024 * 1024);
      if (width === 1) assert.equal(allocations.length, 4096);
      else assert.ok(allocations.length < 4096, 'byte bound must stop retention first');
      assert.equal(hasher.hash(['0:' + '漢'.repeat(width), 'after']), expected(['0:' + '漢'.repeat(width), 'after']));
    } finally { hasher.clear(); }
    assert.ok(allocations.every(bytes => bytes.every(byte => byte === 0)));
  }
});
