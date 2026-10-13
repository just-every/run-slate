import test from 'node:test';
import assert from 'node:assert/strict';
import type { Json } from '../src/types.ts';
import { PlanSizeBudget } from '../src/plan/budget.ts';
import { assertPlanBytes, canonicalJsonBytes, checkedSizeSum, PLAN_BYTES_LIMIT, PlanTooLargeError } from '../src/plan/size.ts';
import { emptyPlan, entry, logicalValue, serializedContentBytes } from './helpers/logical-size.ts';

const safe = BigInt(Number.MAX_SAFE_INTEGER);
const invalidSize = /^INVALID_JSON: canonical byte size exceeds safe integer range$/;
const exactCapError = (expected: bigint) => (error: unknown) => {
  assert.ok(error instanceof PlanTooLargeError);
  assert.equal(error.code, 'IMPORT_PLAN_TOO_LARGE');
  assert.equal(error.subject, 'plan');
  assert.equal(error.limit, 300_000_000);
  assert.equal(BigInt(error.bytes), expected);
  return true;
};
const unsafeSizeError = (error: unknown) => {
  assert.ok(error instanceof Error);
  assert.ok(!(error instanceof PlanTooLargeError));
  assert.match(error.message, invalidSize);
  return true;
};

test('bounded shared DAG fixtures agree with a small serialization oracle and BigInt recurrence', () => {
  for (let bytes = 1n; bytes <= 200n; bytes++) {
    const value = logicalValue(bytes);
    assert.equal(BigInt(Buffer.byteLength(JSON.stringify(value))), bytes);
    assert.equal(BigInt(canonicalJsonBytes(value)), bytes);
  }
  // These exact sizes come from the array punctuation recurrence above; the
  // generated graphs have about 53 nodes, not petabytes of allocated JSON.
  for (const bytes of [safe - 2n, safe - 1n, safe]) {
    assert.equal(BigInt(canonicalJsonBytes(logicalValue(bytes))), bytes);
  }
  assert.throws(() => canonicalJsonBytes(logicalValue(safe + 1n)), unsafeSizeError);
});

const scenarios = [
  {
    name: 'replacement',
    make() {
      const plan = emptyPlan(), budget = new PlanSizeBudget(plan);
      return { plan, budget, apply(value: Json) { plan.source.records[0].payload = value; budget.replace(2, value); } };
    },
  },
  {
    name: 'diagnostic with its comma',
    make() {
      const plan = emptyPlan();
      plan.diagnostics.push({ severity: 'warning', code: 'FIRST', message: 'small' });
      const budget = new PlanSizeBudget(plan);
      return { plan, budget, apply(value: Json) { budget.diagnostic({ severity: 'warning', code: 'NEXT', message: 'small', ...{ details: value } }); } };
    },
  },
  ...['first', 'new', 'existing'].map(kindCase => ({
    name: `entry with ${kindCase} kind and count lexemes`,
    make() {
      const plan = emptyPlan(), budget = new PlanSizeBudget(plan);
      const kind = 'item"漢';
      if (kindCase === 'new') budget.entry(entry('', 'other'));
      if (kindCase === 'existing') for (let i = 0; i < 9; i++) budget.entry(entry('', kind));
      return { plan, budget, apply(value: Json) { budget.entry(entry(value, kind)); } };
    },
  })),
  ...['effects', 'effects and unmapped', 'unmapped and rejection'].map(mode => ({
    name: `mapping ${mode}`,
    make() {
      const plan = emptyPlan(), budget = new PlanSizeBudget(plan), pending = entry();
      budget.entry(pending);
      return {
        plan, budget,
        apply(value: Json) {
          if (mode === 'unmapped and rejection') {
            budget.mapping(pending, [], [{ reason: 'retained', ...{ details: value } }], 'rejected');
          } else {
            budget.mapping(pending, [{ targetKind: 'item', targetId: '1', value }], mode === 'effects' ? [] : [{ reason: 'retained' }]);
          }
        },
      };
    },
  })),
];

for (const scenario of scenarios) for (const overflow of [0n, 1n, 2n, 32n]) {
  test(`${scenario.name} ${overflow ? `rejects safe-range overflow +${overflow}` : 'reports the exact safe-integer boundary'}`, () => {
    const small = scenario.make();
    small.apply('');
    const expected = safe + overflow;
    // One occurrence of the two-byte empty string becomes the shared DAG.
    // Native JSON serialization supplies every other byte independently.
    const valueBytes = expected - serializedContentBytes(small.plan) + 2n;
    assert.ok(valueBytes <= safe, 'the added value is individually safe');
    const value = logicalValue(valueBytes);
    assert.equal(BigInt(canonicalJsonBytes(value)), valueBytes);
    const large = scenario.make();
    if (overflow) assert.throws(() => large.apply(value), unsafeSizeError);
    else {
      large.apply(value);
      assert.throws(() => large.budget.assert(), exactCapError(expected));
    }
  });
}

test('replacement shrinking and signed counter deltas stay exact through the inclusive cap', () => {
  const plan = emptyPlan(); plan.counts.effects = 9;
  const budget = new PlanSizeBudget(plan), initialBytes = serializedContentBytes(plan);
  const hugeBytes = safe - initialBytes + 2n;
  budget.replace(2, logicalValue(hugeBytes));
  assert.throws(() => budget.assert(), exactCapError(safe));
  budget.replace(Number(hugeBytes), '');
  budget.increment('effects');
  assert.equal(plan.counts.effects, 10);
  budget.increment('effects', -1);
  assert.equal(plan.counts.effects, 9);
  assert.equal(serializedContentBytes(plan), initialBytes);
  budget.replace(2, logicalValue(BigInt(PLAN_BYTES_LIMIT) - initialBytes + 2n));
  budget.assert();
  budget.increment('input', 9); // 1 -> 10 adds exactly one canonical byte.
  assert.throws(() => budget.assert(), exactCapError(300_000_001n));
});

test('all numeric counters and arithmetic inputs reject unsafe or nonfinite sums', () => {
  assert.equal(checkedSizeSum(Number(safe), -Number(safe)), 0);
  assert.equal(checkedSizeSum(-Number(safe), Number(safe) - 1), -1);
  for (const invalid of [NaN, Infinity, -Infinity, 0.5, Number(safe + 1n)]) {
    assert.throws(() => checkedSizeSum(invalid, 0), unsafeSizeError);
    assert.throws(() => checkedSizeSum(0, invalid), unsafeSizeError);
    assert.throws(() => assertPlanBytes(invalid), unsafeSizeError);
  }
  assert.throws(() => checkedSizeSum(-Number(safe), -1), unsafeSizeError);
  for (const key of ['input', 'unique', 'duplicates', 'mapped', 'unmapped', 'rejected', 'effects'] as const) {
    const plan = emptyPlan(); plan.counts[key] = Number(safe - 1n);
    const budget = new PlanSizeBudget(plan);
    budget.increment(key);
    assert.equal(plan.counts[key], Number(safe));
    assert.throws(() => budget.increment(key), unsafeSizeError);
    assert.equal(plan.counts[key], Number(safe), 'an unsafe count is never retained');
  }
  const plan = emptyPlan(); plan.counts.byKind.item = Number(safe);
  const budget = new PlanSizeBudget(plan);
  assert.throws(() => budget.entry(entry()), unsafeSizeError);
  assert.equal(plan.counts.byKind.item, Number(safe));
});

test('cycle and depth guards keep rejecting before a budget can admit malformed JSON', () => {
  const cycle: Json[] = []; cycle.push(cycle);
  let deep: Json = '';
  for (let i = 0; i < 256; i++) deep = [deep];
  assert.equal(canonicalJsonBytes(deep), 2 * 256 + 2);
  const accepted = new PlanSizeBudget(emptyPlan());
  accepted.replace(2, deep); accepted.assert();
  for (const value of [cycle, [deep]]) {
    const budget = new PlanSizeBudget(emptyPlan());
    assert.throws(() => budget.replace(2, value), /INVALID_JSON: cyclic or excessively nested durable value/);
    budget.assert();
  }
});
