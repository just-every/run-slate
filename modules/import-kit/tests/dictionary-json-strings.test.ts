import test from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { dictionaryEncode, dictionaryDecode } from '../src/d1/plan-dictionary.ts';
import { compressedPlan, expandCompressedPlan } from '../src/d1/stream-plan.ts';
import { canonicalJson, sha256 } from '../src/provenance/identity.ts';
import { buildImportPlan } from '../src/plan/index.ts';
import { source, mapping } from './d1/fixtures.ts';
import type { D1PlanCodec, ImportPlan, Json } from '../src/d1/index.ts';

test('embedded JSON shares literal bytes while retaining exact serialized text and types', () => {
  const statement = Array.from({ length: 1000 }, (_, index) => String.fromCharCode(0x4e00 + index)).join('');
  const consent = { accepted: true, statement }, encoded = JSON.stringify(consent);
  const values = [consent, encoded, JSON.stringify({ accepted: false, statement }), JSON.stringify({ nested: encoded }), '{ "spaced" : 1 }', '{"negative":-0}', '{"number":1.0,"exponent":1e0}', '{"escaped":"\\u6f22","slash":"\\/"}', '{"surrogate":"\\ud800"}', '{malformed', '[1,"漢",null]', '[]', '{}', '{"10":1,"2":2}', JSON.stringify(JSON.parse('{"__proto__":{"constructor":"😀\\n"}}'))];
  const packed: any = dictionaryEncode(values);
  assert.equal(packed.version, 2);
  assert.equal(packed.strings.filter((value: string) => value === statement).length, 1);
  assert.equal(packed.strings.includes(encoded), false);
  assert.deepEqual(dictionaryDecode(packed), values);
  assert.equal(canonicalJson(dictionaryDecode(packed)), canonicalJson(values));
  assert.ok(Buffer.byteLength(canonicalJson(packed)) < Buffer.byteLength(canonicalJson(values)) / 2);
  (dictionaryDecode(packed) as any[])[0].statement = 'Changed only in this read';
  assert.deepEqual(dictionaryDecode(packed), values);
});

test('structured string tables reject malformed, unused, cyclic and duplicate entries', () => {
  const base = { version: 2, strings: ['key', 'value'], json: [[2, 0, [0, 1]]], tree: [3, 0] };
  assert.equal(dictionaryDecode(base), '{"key":"value"}');
  for (const value of [
    { ...base, version: 3 }, { ...base, extra: true }, { ...base, json: null },
    { ...base, tree: [3, 0, 'ignored'] }, { ...base, tree: [3, -1] }, { ...base, tree: [3, 1] },
    { ...base, tree: null }, { ...base, json: [[3, 0]] },
    { ...base, json: [base.json[0], base.json[0]], tree: [1, [3, 0], [3, 1]] },
    { ...base, json: [[0, 0]] }, { ...base, json: Array(1) },
    { strings: [], tree: [3, 0] },
  ]) assert.throws(() => dictionaryDecode(value), /STORED_PLAN_CHANGED/);
  const expanding: any = { version: 2, strings: ['value'], json: [[1, [0, 0]]], tree: [3, 29] };
  for (let index = 1; index < 30; index++) expanding.json.push([1, [3, index - 1], [3, index - 1], [3, index - 1], [3, index - 1]]);
  assert.throws(() => dictionaryDecode(expanding, 1024), /STORED_PLAN_CHANGED/);
  assert.throws(() => dictionaryDecode(base, 1), /STORED_PLAN_CHANGED/);
});

test('nested JSON text retains only payload strings and bounds their aggregate reconstruction', () => {
  const values = [JSON.stringify(Array(10000).fill(1))];
  for (let index = 0; index < 10; index++) values.push(JSON.stringify([values.at(-1)]));
  const final = values.at(-1)!;
  const packed: any = dictionaryEncode(final);
  assert.equal(packed.json.length, 1);
  assert.equal(dictionaryDecode(packed, Buffer.byteLength(canonicalJson(final))), final);
  const all = dictionaryEncode(values);
  assert.deepEqual(dictionaryDecode(all, Buffer.byteLength(canonicalJson(values))), values);
  const repeated: any = { version: 2, strings: ['x'], json: [[1, [0, 0]], [1, [3, 0]]], tree: [1, [3, 0], [3, 1]] };
  const sizes = [Buffer.byteLength('["x"]'), Buffer.byteLength(JSON.stringify(['["x"]']))];
  assert.ok(Math.max(...sizes) <= 12 && sizes.reduce((sum, size) => sum + size, 0) > 12);
  assert.throws(() => dictionaryDecode(repeated, 12), /STORED_PLAN_CHANGED/);
  let reads = 0;
  Object.defineProperty(repeated.json, 0, { get() { reads++; throw new Error('Unnecessary reconstruction'); } });
  repeated.tree = [3, 1];
  assert.throws(() => dictionaryDecode(repeated, Number.MAX_SAFE_INTEGER), /STORED_PLAN_CHANGED/);
  assert.equal(reads, 0);
});

test('persisted first-version dictionaries still decode and retain their canonical plan', () => {
  const bundle = source(2);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  const plan = buildImportPlan(bundle, mapping, { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', authorization: { principalId: 'owner' } });
  const codec: D1PlanCodec = { id: 'identity-v1', encode: plan => plan as unknown as Json, decode: value => value as unknown as ImportPlan };
  const envelope = JSON.parse(compressedPlan(plan, codec));
  for (const payloadSize of [-1, 1, envelope.payloadSize + 1]) assert.throws(() => expandCompressedPlan(canonicalJson({ ...envelope, payloadSize }), codec), /STORED_PLAN_CHANGED/);
  const strings: string[] = [];
  const intern = (text: string) => { const existing = strings.indexOf(text); if (existing >= 0) return existing; strings.push(text); return strings.length - 1; };
  const legacy = (value: any): any => typeof value === 'string' ? [0, intern(value)] : Array.isArray(value) ? [1, ...value.map(legacy)] : value && typeof value === 'object' ? [2, ...Object.entries(value).flatMap(([key, value]) => [intern(key), legacy(value)])] : value;
  const tree = legacy(plan), body = canonicalJson({ strings, tree });
  Object.assign(envelope, { dictionary: 1, size: Buffer.byteLength(body), sha256: sha256(body), data: Buffer.from(brotliCompressSync(body)).toString('base64') });
  delete envelope.payloadSize;
  assert.deepEqual(expandCompressedPlan(canonicalJson(envelope), codec), plan);
  assert.throws(() => expandCompressedPlan(canonicalJson({ ...envelope, dictionary: 2 }), codec), /STORED_PLAN_CHANGED/);
  for (const malformed of [null, false, 1, 'text', []]) {
    assert.throws(() => expandCompressedPlan(canonicalJson(malformed), codec), /STORED_PLAN_CHANGED/);
    const invalidBody = canonicalJson(malformed);
    for (const dictionary of [1, 2]) assert.throws(() => expandCompressedPlan(canonicalJson({ ...envelope, dictionary, ...(dictionary === 2 ? { payloadSize: 64 } : {}), size: Buffer.byteLength(invalidBody), sha256: sha256(invalidBody), data: Buffer.from(brotliCompressSync(invalidBody)).toString('base64') }), codec), /STORED_PLAN_CHANGED/);
  }
});
