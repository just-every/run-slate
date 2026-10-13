import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan } from '../src/plan/index.ts';
import { canonicalJsonBytes, PlanTooLargeError } from '../src/plan/size.ts';
import { sha256 } from '../src/provenance/identity.ts';
import type { Json, SourceBundle } from '../src/types.ts';
import { logicalValue, serializedContentBytes } from './helpers/logical-size.ts';

const context = { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', authorization: { principalId: 'owner' } };
const source = (): SourceBundle => ({
  artifacts: [{ name: 'test.json', sha256: sha256('0'), size: 1 }], diagnostics: [],
  records: [{ namespace: 'archive', kind: 'item', sourceId: '1', payload: 0, payloadHash: sha256('0'), artifactHash: sha256('0'), location: { artifact: 'test.json' } }],
});
const result = (value: Json) => ({ effects: [{ targetKind: 'item', targetId: '1', value }] });

for (const overflow of [0n, 1n, 2n]) test(`planner cumulative safe-integer boundary +${overflow} precedes mapper serialization`, t => {
  const small = buildImportPlan(source(), { version: 'v1', map: () => result('') }, context);
  const expected = BigInt(Number.MAX_SAFE_INTEGER) + overflow;
  const value = logicalValue(expected - serializedContentBytes(small) + 2n);
  const mapped = result(value);
  assert.ok(Number.isSafeInteger(canonicalJsonBytes(mapped)), 'the complete mapper result is individually safe');
  const stringify = JSON.stringify;
  let calls = 0;
  t.mock.method(JSON, 'stringify', (item: unknown, ...args: any[]) => {
    if (calls && typeof item === 'string') throw new Error('MAPPER_ENCODED_BEFORE_ADMISSION');
    return stringify(item, ...args);
  });
  assert.throws(() => buildImportPlan(source(), { version: 'v1', map: () => { calls++; return mapped; } }, context), (error: any) => {
    if (overflow) {
      assert.ok(!(error instanceof PlanTooLargeError));
      assert.equal(error.message, 'INVALID_JSON: canonical byte size exceeds safe integer range');
    } else {
      assert.ok(error instanceof PlanTooLargeError);
      assert.equal(BigInt(error.bytes), expected);
      assert.equal(error.subject, 'plan');
      assert.equal(error.limit, 300_000_000);
    }
    return true;
  });
  assert.equal(calls, 1);
});
