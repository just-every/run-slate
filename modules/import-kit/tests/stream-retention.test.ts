import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { sqlitePort } from './d1/sqlite-runtime.ts';
import { buildImportPlan } from '../src/plan/index.ts';
import { canonicalJson, sha256 } from '../src/provenance/identity.ts';
import { partitionPlan } from '../src/d1/stream-partition.ts';
import { compressedPlan, expandCompressedPlan } from '../src/d1/stream-plan.ts';
import type { ImportPlan, Json } from '../src/types.ts';

const codec = { id: 'finite-json-v1', encode: (plan: ImportPlan) => plan as unknown as Json, decode: (value: Json) => value as unknown as ImportPlan };
function statements(count: number, length: number) {
  return Array.from({ length: count }, (_, q) => {
    let seed = q + 1;
    return Array.from({ length }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return String.fromCharCode(0x4e00 + seed % 20000); }).join('');
  });
}
function fixture(rows: number, width: number, length: number) {
  const dictionary = statements(width, length);
  const records = Array.from({ length: rows }, (_, row) => {
    const payload = { row, answers: dictionary.map((statement, q) => ({ accepted: (row + q) % 2 === 0, statement })) };
    return { namespace: 'review', kind: 'response', sourceId: String(row), payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: 'a'.repeat(64), location: { artifact: 'safe.csv', row } };
  });
  let calls = 0;
  const plan = buildImportPlan({ records, artifacts: [{ name: 'safe.csv', sha256: 'a'.repeat(64), size: rows * width * 2, original: { status: 'unavailable', reason: 'not-supplied' } }], diagnostics: [] }, { version: 'v1', map: record => { calls++; return { effects: [{ targetKind: 'response', targetId: record.sourceId, value: record.payload }] }; } }, { destination: 'workspace', namespace: 'review', mappingVersion: 'v1', authorization: { principalId: 'owner' } });
  assert.equal(calls, rows);
  return { plan, records, dictionary };
}

for (const length of [255, 256, 257]) test(`aggregate custody for ${length}-unit repeated Unicode stays bounded across every retained page`, t => {
  const { plan, records } = fixture(100, 49, length);
  const pages = [...partitionPlan(plan)], retained = pages.map(page => compressedPlan(page, codec));
  const bytes = retained.reduce((sum, body) => sum + Buffer.byteLength(body), 0);
  t.diagnostic(JSON.stringify({ records: records.length, statementLength: length, pages: pages.length, retainedBytes: bytes }));
  assert.ok(bytes < 512 * 1024, `the complete retained page collection uses ${bytes} bytes`);
  const restored = retained.flatMap(body => expandCompressedPlan(body, codec).entries);
  assert.deepEqual(restored.map(entry => entry.source), records);
  assert.deepEqual(restored, plan.entries);
});

test('coalesced normalized pages keep complete ordered custody and mapper decisions while sharing repeated metadata', async t => {
  const { amplifiedPlan, mergePlanPages } = await import('../src/d1/stream-working-set.ts');
  const { erasePlanRecords } = await import('../src/d1/erased-plan.ts');
  const { retainPlan, loadPlans } = await import('../src/d1/plans.ts');
  const { plan } = fixture(201, 49, 256);
  const pages = [...partitionPlan(plan)];
  assert.ok(amplifiedPlan(plan));
  const merged = mergePlanPages(pages);
  assert.equal(merged.fingerprint, plan.fingerprint);
  assert.deepEqual(merged.entries, plan.entries);
  assert.deepEqual(merged.source, plan.source);
  assert.equal(canonicalJson(merged.counts), canonicalJson(plan.counts));
  const before = compressedPlan(merged, codec);
  assert.ok(Buffer.byteLength(before) < 128 * 1024, 'all coalesced records share one dictionary');
  const removed = plan.entries[100], erased = erasePlanRecords(merged, new Set([removed.identity]));
  const retained = retainPlan(erased, 'job', codec);
  const envelope = JSON.parse(retained.body);
  assert.equal(envelope.d1Plan, 1);
  const chunks = retained.statements.flatMap(statement => JSON.parse(statement.params![0])).map(row => ({ ...row, job_id: 'job' }));
  const native = new DatabaseSync(':memory:'); t.after(() => native.close());
  native.exec('CREATE TABLE ik_d1_plan_chunks(job_id TEXT,ordinal INTEGER,body TEXT)');
  const insert = native.prepare('INSERT INTO ik_d1_plan_chunks VALUES(?,?,?)');
  for (const chunk of chunks) insert.run(chunk.job_id,chunk.ordinal,chunk.body);
  const database = sqlitePort(native);
  const decoded = (await loadPlans([{ id: 'job', plan_json: retained.body }], database, codec)).get('job')!;
  assert.deepEqual(decoded.entries[100].source.payload, { erased: true });
  assert.deepEqual(decoded.entries[100].effects, []);
  assert.deepEqual(decoded.entries.filter((_, i) => i !== 100), plan.entries.filter((_, i) => i !== 100));
  assert.ok(retained.statements.reduce((sum, statement) => sum + Buffer.byteLength(String(statement.params![0])), 0) < 256 * 1024, 'erasure must not expand all retained private metadata into SQL buffers');
});

test('one local working-set measurement preserves exact sizes and is fresh after mutation',async()=>{
  const {measurePlanWorkingSet}=await import('../src/d1/stream-working-set.ts');
  const {canonicalSize}=await import('../src/provenance/canonical-stream.ts');
  const {dictionaryWeight}=await import('../src/d1/stream-partition.ts');
  const {plan}=fixture(3,2,256),measure=measurePlanWorkingSet(plan);
  assert.deepEqual(measure,{bytes:dictionaryWeight(plan),expandedBytes:canonicalSize(plan),amplified:canonicalSize(plan)>4*dictionaryWeight(plan)});
  (plan.entries[0].effects[0].value as any).fresh='new native value';
  const changed=measurePlanWorkingSet(plan);
  assert.deepEqual(changed,{bytes:dictionaryWeight(plan),expandedBytes:canonicalSize(plan),amplified:canonicalSize(plan)>4*dictionaryWeight(plan)});
  assert.notEqual(changed.expandedBytes,measure.expandedBytes);
});
