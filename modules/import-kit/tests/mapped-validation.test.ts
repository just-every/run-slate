import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan, planFingerprint } from '../src/plan/index.ts';
import { canonicalJson, sha256 } from '../src/provenance/identity.ts';

const context = { destination: 'workspace', namespace: 'records', mappingVersion: 'v1', authorization: { principalId: 'owner' } };
function source() {
  const payload = { text: '漢😀\ud800' }, hash = sha256(canonicalJson(payload));
  return { diagnostics: [], artifacts: [{ name: 'data.json', sha256: hash, size: Buffer.byteLength(canonicalJson(payload)) }], records: [{ namespace: 'records', kind: 'record', sourceId: 'one', payload, payloadHash: hash, artifactHash: hash, location: { artifact: 'data.json', row: 1 } }] };
}

test('all mapped fields remain finite JSON validated even when they are not retained as effects', () => {
  for (const extra of [undefined, NaN, Infinity, -Infinity, new Date(), new Map(), Array(1), { nested: undefined }]) {
    assert.throws(() => buildImportPlan(source(), { version: 'v1', map: record => ({ effects: [{ targetKind: 'record', targetId: record.sourceId, value: record.payload }], extra }) }, context), /INVALID_JSON/);
  }
});

test('mapped validation preserves sorted getter reads, exact values and the independent canonical fingerprint', () => {
  const reads: string[] = [], effects = [{ targetKind: 'record', targetId: 'one', value: JSON.parse('{"__proto__":"own","10":1,"2":"1","typed":[false,0,"0",null,"漢😀"]}') }];
  const mapped = { effects, get z() { reads.push('z'); return false; }, get a() { reads.push('a'); return ['a']; } };
  const plan = buildImportPlan(source(), { version: 'v1', map: () => mapped }, context);
  assert.deepEqual(reads.slice(0, 2), ['a', 'z']);
  assert.equal(canonicalJson(plan.entries[0].effects), canonicalJson(effects));
  const { fingerprint, ...content } = plan;
  assert.equal(fingerprint, sha256(canonicalJson(content)));
  assert.equal(planFingerprint(plan), fingerprint);
});

test('mapper cycles and excessive nesting reject through finite validation before encoding', () => {
  const cycle: any = {}; cycle.self = cycle;
  let deep: any = null;
  for (let i = 0; i < 256; i++) deep = [deep];
  for (const extra of [cycle, deep]) assert.throws(() => buildImportPlan(source(), { version: 'v1', map: () => ({ effects: [], extra }) }, context), /INVALID_JSON/);
});
