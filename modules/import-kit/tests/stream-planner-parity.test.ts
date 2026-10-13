import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan, buildStreamPagePlan } from '../src/plan/index.ts';
import { canonicalJson, sha256 } from '../src/provenance/identity.ts';
import { source } from './d1/fixtures.ts';
const context = { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', authorization: { principalId: 'owner' } };

test('ordinary and stream page planning retain identical source, mapping, rejection and fingerprints with independent containers', () => {
  const results = [buildImportPlan, buildStreamPagePlan].map(build => {
    const bundle = source(2), before = canonicalJson(bundle), returned: any[] = [];
    const plan = build(bundle, { version: 'v1', map: record => {
      record.payload.email = 'mapper-owned@example.test';
      const mapped = record.sourceId === '0' ? { effects: [{ targetKind: 'record', targetId: record.sourceId, value: record.payload }] } : { effects: [], rejection: 'Unsupported source record' };
      returned.push(mapped); return mapped;
    } }, context);
    assert.equal(canonicalJson(bundle), before);
    returned[0].effects[0].value.email = 'changed after planning';
    assert.equal(plan.entries[0].effects[0].value.email, 'mapper-owned@example.test');
    assert.equal(plan.entries[0].source.payload.email, 'person0@example.test');
    assert.notEqual(plan.source.records, bundle.records);
    const { fingerprint, ...content } = plan; assert.equal(fingerprint, sha256(canonicalJson(content)));
    return plan;
  });
  assert.deepEqual(results[0], results[1]);
});

for (const build of [buildImportPlan, buildStreamPagePlan]) test(`${build.name} captures hostile mapper getters once before size, credential and effect checks`, () => {
  let reads = 0;
  const plan = build(source(1), { version: 'v1', map: () => ({ effects: [{ targetKind: 'record', targetId: 'one', value: { get label() { reads++; return reads === 1 ? 'reviewed' : 'https://example.test/?token=private'; } } }] }) }, context);
  assert.equal(reads, 1); assert.equal(plan.entries[0].effects[0].value.label, 'reviewed');
  assert.throws(() => build(source(1), { version: 'v1', map: () => ({ effects: [{ targetKind: 'record', targetId: 'one', value: { get label() { return 'https://example.test/?token=private'; } } }] }) }, context), /CREDENTIAL_IN_DURABLE_URL/);
  const effects: any[] = [];
  const rejected = build(source(1), { version: 'v1', map: () => ({ effects, get rejection() { effects.push({ targetKind: 'record', targetId: 'late', value: 'late mutation' }); return 'Unsupported'; } }) }, context);
  assert.deepEqual(rejected.entries[0].effects, []); assert.equal(rejected.entries[0].rejection, 'Unsupported');
  const changed = [0, 1]; Object.defineProperty(changed, 0, { get() { changed.length = 0; return null; } });
  assert.throws(() => build(source(1), { version: 'v1', map: () => ({ effects: [], extra: changed }) }, context), /INVALID_JSON/);
});
