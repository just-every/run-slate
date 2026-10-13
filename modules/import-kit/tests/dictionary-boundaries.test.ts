import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan } from '../src/plan/index.ts';
import { canonicalJson, sha256 } from '../src/provenance/identity.ts';
import { compressedPlan, expandCompressedPlan } from '../src/d1/stream-plan.ts';
import { partitionPlan } from '../src/d1/stream-partition.ts';
import type { ImportPlan, Json } from '../src/types.ts';

const codec = { id: 'finite-json-v1', encode: (plan: ImportPlan) => plan as unknown as Json, decode: (value: Json) => value as unknown as ImportPlan };
for (const bytes of [128 * 1024 - 1, 128 * 1024, 128 * 1024 + 1]) test(`complete normalized custody preserves a ${bytes}-byte distinct Unicode dictionary`, t => {
  const statements = Array.from({ length: 49 }, (_, index) => {
    let seed = index + 1;
    return Array.from({ length: 891 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return String.fromCharCode(0x4e00 + seed % 20000); }).join('');
  });
  statements[0] += 'a'.repeat(bytes - statements.reduce((sum, item) => sum + Buffer.byteLength(item), 0));
  assert.equal(statements.reduce((sum, item) => sum + Buffer.byteLength(item), 0), bytes);
  const records = Array.from({ length: 17 }, (_, row) => {
    const payload = { row, answers: statements.map((statement, column) => ({ accepted: (row + column) % 2 === 0, statement })) };
    return { namespace: 'review', kind: 'response', sourceId: String(row), payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: 'a'.repeat(64), location: { artifact: 'safe.csv', row } };
  });
  let mapped = 0;
  const plan = buildImportPlan({ records, artifacts: [{ name: 'safe.csv', sha256: 'a'.repeat(64), size: 17 * 49 * 2, original: { status: 'unavailable', reason: 'not-supplied' } }], diagnostics: [] }, { version: 'v1', map(record) { mapped++; return { effects: [{ targetKind: 'response', targetId: record.sourceId, value: record.payload }] }; } }, { namespace: 'review', destination: 'workspace', mappingVersion: 'v1', authorization: { principalId: 'operator' } });
  const retained = [...partitionPlan(plan)].map(page => compressedPlan(page, codec));
  const total = retained.reduce((sum, item) => sum + Buffer.byteLength(item), 0);
  t.diagnostic(JSON.stringify({ distinctLiteralBytes: bytes, records: records.length, pages: retained.length, retainedBytes: total }));
  assert.equal(mapped, records.length);
  assert.ok(total < 512 * 1024);
  assert.deepEqual(retained.flatMap(body => expandCompressedPlan(body, codec).entries), plan.entries);
});
