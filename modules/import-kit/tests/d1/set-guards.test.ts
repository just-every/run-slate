import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { planD1Import, createD1ImportJob, applyD1ImportBatches, resumeD1Import, readD1ImportOriginals, undoD1Import } from '../../src/d1/index.ts';
import { meter } from './meter.ts';
import { scaleTargets } from './scale-adapter.ts';

for (const [name, mutation] of [
  ['entry', "UPDATE ik_d1_entries SET effects_hash='changed' WHERE ordinal=0"],
  ['provenance', "UPDATE ik_provenance SET record_json=json_set(record_json,'$.valueHash','changed') WHERE ordinal=0"],
  ['claim', "UPDATE ik_sources SET effects_hash='changed' WHERE identity=(SELECT source_identity FROM ik_d1_entries WHERE ordinal=0)"],
  ['owner', "UPDATE ik_jobs SET namespace='changed'"],
  ['journal', 'UPDATE ik_batches SET end_position=9'],
  ['custody bytes', "UPDATE ik_originals SET bytes=X'00'"],
] as const) test(`real D1: late unrelated early ${name} change aborts publication`, async t => {
  const r = await runtime(t), ctx = { ...r.context(), batchSize: 10, maxBatches: 1 };
  const plan = await planD1Import(source(11), mapping, ctx), job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  assert.equal((await applyD1ImportBatches(job.id, ctx)).checkpoint, 10);
  let injected = false;
  const racing = { ...targets, async read(...args: Parameters<typeof targets.read>) { const result = await targets.read(...args); if (!injected) { injected = true; await r.db().prepare(mutation).run(); } return result; } };
  await assert.rejects(resumeD1Import(job.id, { ...ctx, storage: { ...ctx.storage, targets: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT checkpoint FROM ik_jobs').first())?.checkpoint, 10);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())?.n, 10);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_batches').first())?.n, 1);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_assertions').first())?.n, 0);
});

test('real D1: chunked multibyte plan and >2MB original retain exact bytes after undo', async t => {
  const r = await runtime(t), m = meter(r.db()), ctx = { ...r.context(), batchSize: 1, maxBatches: 1, storage: { database: m.database, targets: scaleTargets } };
  const bundle = source(1);
  const bytes = Buffer.from('quotes " and 🌱 Unicode\n'.repeat(100000));
  const { sha256 } = await import('../../src/provenance/identity.ts');
  bundle.artifacts.push({ name: 'large.txt', sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } });
  const plan = await m.request('large-plan', () => planD1Import(bundle, mapping, ctx));
  const job = await m.request('large-create', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }));
  const raw = await r.db().prepare('SELECT plan_json FROM ik_jobs').first();
  assert.equal(JSON.parse(raw!.plan_json).d1Plan, 1);
  assert.ok((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_original_chunks').first())!.n > 1);
  await m.request('large-resume', () => resumeD1Import(job.id, ctx));
  await m.request('large-undo', () => undoD1Import(job.id, ctx));
  const originals = await m.request('large-originals', () => readD1ImportOriginals(job.id, ctx));
  assert.deepEqual(originals[1].original, { status: 'retained', base64: bytes.toString('base64') });
  console.log(JSON.stringify({ largeCustody: m.snapshots }));
});

test('real D1: late plan and original chunk changes preserve the checkpoint', async t => {
  const r = await runtime(t), ctx = r.context(), bundle = source(1);
  const bytes = Buffer.from('x'.repeat(150000));
  const { sha256 } = await import('../../src/provenance/identity.ts');
  bundle.artifacts.push({ name: 'large.txt', sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } });
  for (const table of ['ik_d1_plan_chunks', 'ik_d1_original_chunks']) {
    const plan = await planD1Import(bundle, mapping, ctx), job = await createD1ImportJob(plan, { ...ctx, operationKey: table, reviewedFingerprint: plan.fingerprint });
    let once = false;
    const race = { ...targets, async read(...args: Parameters<typeof targets.read>) { const value = await targets.read(...args); if (!once) { once = true; await r.db().prepare(`UPDATE ${table} SET ${table === 'ik_d1_plan_chunks' ? "body=body||'x'" : "bytes=X'00'"} WHERE job_id=? AND ordinal=0`).bind(job.id).run(); } return value; } };
    await assert.rejects(resumeD1Import(job.id, { ...ctx, storage: { ...ctx.storage, targets: race } }), /IMPORT_ATOMIC_GUARD/);
    assert.equal((await r.db().prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').bind(job.id).first())?.checkpoint, 0);
    assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())?.n, 0);
  }
});

test('real D1: oversized native value fails before any publication', async t => {
  const r = await runtime(t), ctx = r.context(), plan = await planD1Import(source(1), mapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  const oversized = { ...targets, write(row: any) { return [...targets.write(row), { sql: 'UPDATE evidence SET detail=? WHERE id=?', params: ['🌱'.repeat(500001), row.targetId] }]; } };
  await assert.rejects(resumeD1Import(job.id, { ...ctx, storage: { ...ctx.storage, targets: oversized } }), /IMPORT_D1_VALUE_LIMIT/);
  assert.equal((await r.db().prepare('SELECT checkpoint FROM ik_jobs').first())?.checkpoint, 0);
  for (const table of ['contacts','evidence','ik_sources','ik_provenance','ik_batches','ik_d1_assertions']) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0);
});
