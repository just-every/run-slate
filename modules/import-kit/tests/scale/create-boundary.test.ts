import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping } from '../d1/fixtures.ts';
import { meter } from '../d1/meter.ts';
import { planD1Import, preflightD1ImportJob, createD1ImportJob, readD1ImportOriginals, sha256, canonicalJson, PLAN_BYTES_LIMIT, PlanTooLargeError } from '../../src/d1/index.ts';

// Orchestrator ruling, 8 Oct 2026: no creation input reaches 1000 D1 requests
// before Node fails on string length or memory, so the kit refuses plans over
// PLAN_BYTES_LIMIT canonical bytes before encoding them (README "Plan-size cap").
test('real D1: at-cap custody creates; one byte over PLAN_BYTES_LIMIT is refused before encoding with every kit table empty', async t => {
  const r = await runtime(t), m = meter(r.db()), ctx = { ...r.context(), storage: { ...r.context().storage, database: m.database } };
  const bundleFor = (bytes: Buffer, base64: string, name: string) => {
    const bundle = source(0);
    bundle.artifacts = [{ name, sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64 } }];
    return bundle;
  };
  const encodedBytes = (plan: any) => { const { fingerprint: _fingerprint, ...content } = plan; return Buffer.byteLength(canonicalJson(content)); };
  // Size the boundary from one small plan's actual encoding: one 3-byte
  // original is 4 base64 characters, a one-digit size and a one-character name.
  const tiny = Buffer.from('xxx'), small = await planD1Import(bundleFor(tiny, tiny.toString('base64'), 'n'), mapping, ctx);
  const fixed = encodedBytes(small) - 4 - 1 - 1, over = PLAN_BYTES_LIMIT + 1, rest = over - fixed - 9;
  const groups = Math.floor((rest - 2) / 4), nameLength = rest - 4 * groups, bytes = Buffer.alloc(3 * groups, 120), base64 = bytes.toString('base64');
  assert.equal(String(bytes.length).length, 9); assert.ok(nameLength >= 2 && nameLength <= 5);

  await assert.rejects(m.request('over-cap-plan', () => planD1Import(bundleFor(bytes, base64, 'n'.repeat(nameLength)), mapping, ctx)),
    (error: any) => error instanceof PlanTooLargeError && /^IMPORT_PLAN_TOO_LARGE/.test(error.message) && error.bytes === over && error.limit === PLAN_BYTES_LIMIT && error.subject === 'plan');

  const atCap = await m.request('at-cap-plan', () => planD1Import(bundleFor(bytes, base64, 'n'.repeat(nameLength - 1)), mapping, ctx));
  assert.equal(encodedBytes(atCap), PLAN_BYTES_LIMIT, 'a plan of exactly PLAN_BYTES_LIMIT bytes is accepted');
  const admission = preflightD1ImportJob(atCap, { ...ctx, reviewedFingerprint: atCap.fingerprint });
  assert.ok(admission.totalExecutions <= 1000);

  // One more name byte. The size check runs before the fingerprint, which
  // would otherwise encode the whole plan, so the refusal names the size.
  const grown = { ...atCap, source: { ...atCap.source, artifacts: [{ ...atCap.source.artifacts[0], name: 'n'.repeat(nameLength) }] } };
  assert.throws(() => preflightD1ImportJob(grown, { ...ctx, reviewedFingerprint: atCap.fingerprint }), /IMPORT_PLAN_TOO_LARGE/);
  await assert.rejects(m.request('over-cap-create', () => createD1ImportJob(grown, { ...ctx, reviewedFingerprint: atCap.fingerprint })),
    (error: any) => error instanceof PlanTooLargeError && error.bytes === over && error.subject === 'plan');

  const { results: tables } = await r.db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ik\\_%' ESCAPE '\\'").all();
  assert.ok(tables.length >= 10, 'the kit schema is installed');
  for (const { name } of tables as { name: string }[]) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${name}`).first())?.n, 0, `${name} must remain empty`);
  const job = await m.request('at-cap-create', () => createD1ImportJob(atCap, { ...ctx, reviewedFingerprint: atCap.fingerprint }));
  assert.equal(job.state, 'queued');
  assert.equal(m.snapshots.at(-1).count, admission.totalExecutions);
  assert.equal(m.snapshots.at(-1).statements, admission.totalStatements);
  const [original] = await m.request('at-cap-originals', () => readD1ImportOriginals(job.id, ctx));
  assert.deepEqual(original.original, { status: 'retained', base64 });
  assert.ok(m.snapshots.every(s => s.count <= 1000));
  t.diagnostic(JSON.stringify({ admission, requests: m.snapshots }));
});
