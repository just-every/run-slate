import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, jsonString } from '../src/provenance/identity.ts';
import { canonicalJsonBytes, planContentBytes, PLAN_BYTES_LIMIT, PlanTooLargeError } from '../src/plan/size.ts';
import { planImport } from '../src/plan/index.ts';
import { createImportJob } from '../src/engine/index.ts';
import { setup, source, mapping } from './core/fixtures.ts';

const values: unknown[] = [
  null, true, false, 0, -0, 1e21, 0.1, -123.456e-7, Number.MAX_SAFE_INTEGER, '', 'plain', 'quote " and \\ backslash',
  '\b\f\n\r\t\u0000\u0001\u001f\u007f', 'é ü ß', '漢字', '🌱 pair', '\ud800 lone high', 'lone low \udc00', '􏿿', '  ',
  [], [1, 'two', [3, { four: 4 }]], {}, { b: 1, a: [null, { 'k"ey\n': 'v' }], '漢': '🌱', '': '' }, Object.assign(Object.create(null), { z: 'null prototype' }),
];

test('canonicalJsonBytes equals the UTF-8 length of canonicalJson for every JSON shape, without encoding', () => {
  for (const [index, value] of values.entries()) assert.equal(canonicalJsonBytes(value), Buffer.byteLength(canonicalJson(value)), `value ${index}`);
  assert.equal(canonicalJsonBytes(values), Buffer.byteLength(canonicalJson(values)));
  for (const invalid of [undefined, NaN, Infinity, new Date(0), new Map(), { nested: undefined }, [() => 1]]) {
    assert.throws(() => canonicalJson(invalid), /INVALID_JSON/);
    assert.throws(() => canonicalJsonBytes(invalid), /INVALID_JSON/);
  }
});

test('long strings are escaped in slices identical to JSON.stringify, including pairs and lone surrogates at slice edges', () => {
  const slice = 1 << 20, filler = (n: number) => 'a"\\\n'.repeat(Math.ceil(n / 4)).slice(0, n);
  const cases = [
    filler(slice - 1) + '🌱' + filler(slice + 5),
    filler(slice - 1) + '\ud800' + 'x' + filler(slice),
    filler(slice) + '\udc00' + filler(10),
    filler(slice - 1) + '\udbff' + '􏿿' + filler(slice * 2),
    '漢'.repeat(3 * slice + 7),
  ];
  for (const text of cases) {
    assert.equal(jsonString(text), JSON.stringify(text));
    assert.equal(canonicalJson({ [text.slice(0, 40)]: text }), JSON.stringify({ [text.slice(0, 40)]: text }));
  }
});

test('a two-byte string whose JSON passes 256 MiB is encoded instead of aborting the process', () => {
  // A flat two-byte string: one JSON.stringify call of it aborts V8 with
  // "Zone Allocation failed" (its output buffer passes 2^28 bytes).
  const bytes = Buffer.alloc(140_000_003, 120); bytes.write('漢', 140_000_000);
  const text = bytes.toString('utf8');
  const encoded = canonicalJson(text);
  assert.equal(encoded.length, text.length + 2);
  assert.equal(JSON.parse(encoded), text);
  assert.equal(canonicalJsonBytes(text), Buffer.byteLength(encoded));
});

test('planning and SQLite creation refuse an over-cap source or plan with IMPORT_PLAN_TOO_LARGE and write nothing', async t => {
  const { ctx } = setup(t), huge = 'y'.repeat(PLAN_BYTES_LIMIT);
  const oversized = source(1);
  oversized.diagnostics.push({ severity: 'warning', code: 'NOTE', message: huge });
  assert.throws(() => planImport(oversized, mapping, ctx), (error: any) => error instanceof PlanTooLargeError && error.subject === 'source' && error.bytes > PLAN_BYTES_LIMIT && error.limit === PLAN_BYTES_LIMIT);

  const plan = planImport(source(1), mapping, ctx);
  assert.equal(planContentBytes(plan), (() => { const { fingerprint: _f, ...content } = plan; return Buffer.byteLength(canonicalJson(content)); })());
  const note = { severity: 'warning' as const, code: 'NOTE', message: '' }, grown = { ...plan, diagnostics: [...plan.diagnostics, { ...note, message: huge }] };
  const expected = planContentBytes(plan) + Number(plan.diagnostics.length > 0) + Buffer.byteLength(canonicalJson(note)) + PLAN_BYTES_LIMIT;
  ctx.reviewedFingerprint = plan.fingerprint;
  await assert.rejects(createImportJob(grown, ctx), (error: any) => error instanceof PlanTooLargeError && error.subject === 'plan' && error.bytes === expected);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_jobs').get().n, 0);
});
