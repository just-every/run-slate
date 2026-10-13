import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, sha256 } from '../../src/provenance/identity.ts';
import { canonicalSize } from '../../src/provenance/canonical-stream.ts';
import { buildImportPlan } from '../../src/plan/index.ts';
import { partitionPlan } from '../../src/d1/stream-partition.ts';
import { compressedPlan, expandCompressedPlan } from '../../src/d1/stream-plan.ts';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';

test('repeated immutable Unicode statements remain in bounded lossless dictionaries instead of one dictionary per expanded record', () => {
  const statements = Array.from({ length: 49 }, (_, q) => Array.from({ length: 1000 }, (_, i) => String.fromCharCode(0x4e00 + ((q * 997 + i * 71) % 20000))).join(''));
  const records = Array.from({ length: 100 }, (_, row) => {
    const payload = { row, answers: statements.map(statement => ({ accepted: true, statement })) };
    return { namespace: 'consents', kind: 'response', sourceId: String(row), payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: 'a'.repeat(64), location: { artifact: 'normalized.csv', row } };
  });
  const plan = buildImportPlan({ records, artifacts: [{ name: 'normalized.csv', sha256: 'a'.repeat(64), size: 267209, original: { status: 'unavailable', reason: 'not-supplied' } }], diagnostics: [] }, { version: 'v1', map: record => ({ effects: [{ targetKind: 'response', targetId: record.sourceId, value: record.payload }] }) }, { destination: 'workspace', namespace: 'consents', mappingVersion: 'v1', authorization: { principalId: 'owner' } });
  const codec = { id: 'lossless-json-v1', encode: value => value, decode: value => value };
  const pages = [...partitionPlan(plan)];
  assert.ok(pages.length < 10, 'repeated statement bytes must not multiply the retained dictionaries');
  let ordinal = 0;
  for (const page of pages) {
    const retained = compressedPlan(page, codec), restored = expandCompressedPlan(retained, codec);
    assert.equal(restored.fingerprint, page.fingerprint);
    for (const entry of restored.entries) assert.deepEqual(entry.source.payload, records[ordinal++].payload);
  }
  assert.equal(ordinal, 100);
});

test('canonical size preserves every UTF-8 byte without constructing a whole-document buffer', () => {
  for (const value of [null, false, -0, 1.2, '😀\n\u0000', [], {}, { '"': ['汉字', true, { constructor: 'literal' }] }]) assert.equal(canonicalSize(value), Buffer.byteLength(canonicalJson(value)));
  for (const value of [undefined, NaN, Infinity, new Date()]) assert.throws(() => canonicalSize(value), /INVALID_JSON/);
});

test('compressed custody rejects unreviewed data in the expanded-size receipt', () => {
  const plan = buildImportPlan({ records: [], artifacts: [], diagnostics: [] }, { version: 'v1', map: () => ({ effects: [] }) }, { destination: 'workspace', namespace: 'records', mappingVersion: 'v1', authorization: { principalId: 'owner' } });
  const codec = { id: 'lossless-json-v1', encode: value => value, decode: value => value };
  const envelope = JSON.parse(compressedPlan(plan, codec));
  for (const expandedSize of [0, envelope.expandedSize + 1, 'unreviewed private copy', { private: 'unreviewed' }]) assert.throws(() => expandCompressedPlan(canonicalJson({ ...envelope, expandedSize }), codec), /STORED_PLAN_CHANGED/);
});

for (const layer of ['envelope', 'dictionary']) test(`compressed custody rejects ignored duplicate JSON properties in the ${layer}`, () => {
  const plan = buildImportPlan({ records: [], artifacts: [], diagnostics: [] }, { version: 'v1', map: () => ({ effects: [] }) }, { destination: 'workspace', namespace: 'records', mappingVersion: 'v1', authorization: { principalId: 'owner' } });
  const codec = { id: 'lossless-json-v1', encode: value => value, decode: value => value };
  const original = compressedPlan(plan, codec), envelope = JSON.parse(original);
  const decoded = brotliDecompressSync(Buffer.from(envelope.data, 'base64')).toString('utf8');
  const changed = '{"strings":["unreviewed private source"],' + decoded.slice(1);
  const retained = layer === 'envelope' ? '{"data":"unreviewed private source",' + original.slice(1) : canonicalJson({ ...envelope, size: Buffer.byteLength(changed), sha256: sha256(changed), data: brotliCompressSync(changed).toString('base64') });
  assert.throws(() => expandCompressedPlan(retained, codec), /STORED_PLAN_CHANGED/);
});
