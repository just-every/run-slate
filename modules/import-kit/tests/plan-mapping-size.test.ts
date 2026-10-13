import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport } from '../src/plan/index.ts';
import { PLAN_BYTES_LIMIT, PlanTooLargeError } from '../src/plan/size.ts';
import { setup, source } from './core/fixtures.ts';

// Repeated references still occupy bytes on disk. Keep the input physically
// small and independently count JSON array quotes, commas and content.
const unit = 'x'.repeat(1_000_000);
const expansion = () => Array(300).fill(unit);

test('mapper-only expansion is refused before any large string is encoded', t => {
  const { ctx } = setup(t);
  const small = planImport(source(1), { version: 'v1', map: () => ({ effects: [{ targetKind: 'item', targetId: '0', value: Array(300).fill('') }] }) }, ctx);
  const { fingerprint: _, ...content } = small;
  const expected = Buffer.byteLength(JSON.stringify(content)) + 300 * unit.length;
  const stringify = JSON.stringify;
  t.mock.method(JSON, 'stringify', (value: unknown, ...args: any[]) => {
    if (typeof value === 'string' && value.length >= unit.length) throw new Error('ENCODED_BEFORE_ADMISSION');
    return stringify(value, ...args);
  });
  const mapped = { effects: [{ targetKind: 'item', targetId: '0', value: expansion() }] };
  assert.throws(() => planImport(source(1), { version: 'v1', map: () => mapped }, ctx),
    (error: any) => error instanceof PlanTooLargeError && error.subject === 'plan' && error.bytes === expected);
});

test('cumulative mapper rejections include both entry and diagnostic bytes before encoding', t => {
  const { ctx } = setup(t), bundle = source(3);
  // Two entries of this shape have exactly four serialized copies of reason.
  const small = planImport(bundle, { version: 'v1', map: () => ({ effects: [], rejection: 'x' }) }, ctx);
  // Count the normalized source envelope and only the first two mapped entries.
  small.entries.pop(); small.diagnostics.pop();
  small.counts.unique = small.counts.rejected = small.counts.byKind.item = 2;
  const { fingerprint: _, ...content } = small;
  const length = 76_000_000, expected = Buffer.byteLength(JSON.stringify(content)) + 4 * (length - 1);
  const stringify = JSON.stringify;
  t.mock.method(JSON, 'stringify', (value: unknown, ...args: any[]) => {
    if (typeof value === 'string' && value.length >= 1_000_000) throw new Error('ENCODED_BEFORE_ADMISSION');
    return stringify(value, ...args);
  });
  let calls = 0;
  assert.throws(() => planImport(bundle, { version: 'v1', map: () => { calls++; return { effects: [], rejection: 'x'.repeat(length) }; } }, ctx),
    (error: any) => error instanceof PlanTooLargeError && error.bytes === expected && error.subject === 'plan');
  assert.equal(calls, 2, 'stop as soon as the cumulative retained plan crosses the cap');
});

test('source diagnostics duplicated in the initial plan are guarded before copying source', t => {
  const { ctx } = setup(t), bundle = source(0), stringify = JSON.stringify;
  bundle.diagnostics.push({ severity: 'warning', code: 'NOTE', message: 'x'.repeat(150_000_000) });
  t.mock.method(JSON, 'stringify', (value: unknown, ...args: any[]) => {
    if (typeof value === 'string' && value.length >= 1_000_000) throw new Error('ENCODED_BEFORE_ADMISSION');
    return stringify(value, ...args);
  });
  assert.throws(() => planImport(bundle, { version: 'v1', map: () => ({ effects: [] }) }, ctx),
    (error: any) => error instanceof PlanTooLargeError && error.bytes > PLAN_BYTES_LIMIT && error.subject === 'plan');
});

test('the repeated entry source is admitted before encoding payload or cloning mapper input', t => {
  const { ctx } = setup(t), bundle = source(1);
  // The cap must win before hashing or mapping: the doubled source alone is
  // already too large. Count encoding calls so only the admitted source copy
  // can be serialized. No huge answer string is needed to size the fixture.
  bundle.records[0].payload = { text: Array(151).fill(unit) };
  const stringify = JSON.stringify;
  let largeStrings = 0, calls = 0;
  t.mock.method(JSON, 'stringify', (value: unknown, ...args: any[]) => {
    if (typeof value === 'string' && value.length >= unit.length && ++largeStrings > 151) throw new Error('ENCODED_SOURCE_AGAIN_BEFORE_ADMISSION');
    return stringify(value, ...args);
  });
  assert.throws(() => planImport(bundle, { version: 'v1', map: () => { calls++; return { effects: [] }; } }, ctx),
    (error: any) => error instanceof PlanTooLargeError && error.bytes > 302_000_000 && error.subject === 'plan');
  assert.equal(largeStrings, 151);
  assert.equal(calls, 0);
});
