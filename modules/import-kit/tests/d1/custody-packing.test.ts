import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping } from './fixtures.ts';
import { meter } from './meter.ts';
import { originalStorage } from '../../src/d1/original-storage.ts';
import { planD1Import, createD1ImportJob, preflightD1ImportJob, readD1ImportOriginals, resumeD1Import, undoD1Import, sha256 } from '../../src/d1/index.ts';

function input() {
  const bundle = source(1), bytes = Buffer.from(Array.from({ length: 300_001 }, (_, i) => i % 256));
  bundle.diagnostics.push({ code: 'UNICODE_PREFIX', severity: 'warning', message: '🌱漢\"\\'.repeat(10000) });
  bundle.artifacts.push({ name: 'all-bytes-🌱.bin', size: bytes.length, sha256: sha256(bytes), original: { status: 'available', base64: bytes.toString('base64') } });
  bundle.artifacts.push({ name: 'empty.bin', size: 0, sha256: sha256(''), original: { status: 'available', base64: '' } });
  return bundle;
}
test('real D1: encoded custody preserves every byte including invalid UTF-8, empty bytes and exact undo retention', async t => {
  const r = await runtime(t), m = meter(r.db()), ctx = { ...r.context(), storage: { ...r.context().storage, database: m.database } };
  const bundle = input(), plan = await m.request('plan', () => planD1Import(bundle, mapping, ctx));
  const admission = preflightD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  const job = await m.request('create', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }));
  assert.equal(m.snapshots.at(-1).count, admission.totalExecutions);
  assert.equal((await r.db().prepare('SELECT version FROM ik_original_sets').first())?.version, 3);
  assert.equal((await r.db().prepare("SELECT COUNT(*) AS n FROM ik_d1_original_chunks WHERE typeof(bytes)<>'text'").first())?.n, 0);
  await m.request('resume', () => resumeD1Import(job.id, ctx));
  await m.request('undo', () => undoD1Import(job.id, ctx));
  const originals = await m.request('read-after-undo', () => readD1ImportOriginals(job.id, ctx));
  assert.equal(originals.length, bundle.artifacts.length);
  for (const original of originals) {
    const expected = bundle.artifacts.find(a => a.name === original.name)!;
    assert.deepEqual({ size: original.size, hash: original.sha256, original: original.original }, { size: expected.size, hash: expected.sha256, original: { status: 'retained', base64: (expected.original as any).base64 } });
  }
  console.log(JSON.stringify({ encodedCustody: m.snapshots, admission }));
});
for (const corruption of ['missing', 'extra', 'content', 'ordinal']) test(`real D1: encoded original ${corruption} chunk fails closed`, async t => {
  const r = await runtime(t), ctx = r.context(), plan = await planD1Import(input(), mapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  const row = await r.db().prepare('SELECT * FROM ik_d1_original_chunks WHERE job_id=? AND ordinal=1 LIMIT 1').bind(job.id).first();
  const key = [job.id, row.kind, row.original_key, row.ordinal];
  if (corruption === 'missing') await r.db().prepare('DELETE FROM ik_d1_original_chunks WHERE job_id=? AND kind=? AND original_key=? AND ordinal=?').bind(...key).run();
  if (corruption === 'extra') await r.db().prepare('INSERT INTO ik_d1_original_chunks VALUES(?,?,?,?,?)').bind(job.id, row.kind, row.original_key, 100, row.bytes).run();
  if (corruption === 'content') await r.db().prepare("UPDATE ik_d1_original_chunks SET bytes='AAAA' WHERE job_id=? AND kind=? AND original_key=? AND ordinal=?").bind(...key).run();
  if (corruption === 'ordinal') await r.db().prepare('UPDATE ik_d1_original_chunks SET ordinal=100 WHERE job_id=? AND kind=? AND original_key=? AND ordinal=?').bind(...key).run();
  await assert.rejects(readD1ImportOriginals(job.id, ctx), /ORIGINAL_CUSTODY_MISMATCH/);
  await assert.rejects(resumeD1Import(job.id, ctx), /ORIGINAL_CUSTODY_MISMATCH/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())?.n, 0);
});
for (const failure of ['sql', 'revoke', 'missing-plan']) test(`real D1: ${failure} during packed custody creation leaves zero changes`, async t => {
  const r = await runtime(t), ctx = r.context(), plan = await planD1Import(input(), mapping, ctx);
  await r.db().prepare(failure === 'sql' ? "CREATE TRIGGER fail_custody BEFORE INSERT ON ik_d1_original_chunks WHEN NEW.ordinal=1 BEGIN SELECT RAISE(ABORT,'CUSTODY_FAILURE'); END" : failure === 'revoke' ? 'CREATE TRIGGER revoke_custody AFTER INSERT ON ik_d1_original_chunks BEGIN UPDATE sessions SET enabled=0; END' : 'CREATE TRIGGER remove_plan_chunk AFTER INSERT ON ik_d1_plan_chunks WHEN NEW.ordinal=0 BEGIN DELETE FROM ik_d1_plan_chunks WHERE job_id=NEW.job_id AND ordinal=0; END').run();
  await assert.rejects(createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }), failure === 'sql' ? /CUSTODY_FAILURE/ : /IMPORT_ATOMIC_GUARD/);
  for (const table of ['ik_jobs','ik_d1_plan_chunks','ik_original_sets','ik_originals','ik_d1_original_chunks','ik_d1_assertions']) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0, table);
  assert.equal((await r.db().prepare('SELECT enabled FROM sessions').first())?.enabled, 1);
});
for (const version of [1, 2]) for (const shape of ['inline', 'chunked']) test(`real D1: legacy version ${version} ${shape} binary custody still reads and survives undo`, async t => {
  const r = await runtime(t), ctx = r.context(), plan = await planD1Import(shape === 'inline' ? source(1) : input(), mapping, ctx);
  const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  const legacy = originalStorage(plan, job.id, version);
  await r.db().batch([
    r.db().prepare('UPDATE ik_original_sets SET version=? WHERE job_id=?').bind(version, job.id),
    r.db().prepare('DELETE FROM ik_d1_original_chunks WHERE job_id=?').bind(job.id),
    ...legacy.rows.map(row => r.db().prepare('UPDATE ik_originals SET bytes=? WHERE job_id=? AND kind=? AND original_key=?').bind(row.bytes === null ? null : Uint8Array.from(Buffer.from(row.bytes, 'hex')).buffer, job.id, row.kind, row.original_key)),
    ...legacy.chunks.map(row => r.db().prepare('INSERT INTO ik_d1_original_chunks VALUES(?,?,?,?,?)').bind(job.id, row.kind, row.original_key, row.ordinal, Uint8Array.from(Buffer.from(row.bytes, 'hex')).buffer)),
  ]);
  const before = await readD1ImportOriginals(job.id, ctx);
  await resumeD1Import(job.id, ctx); await undoD1Import(job.id, ctx);
  assert.deepEqual(await readD1ImportOriginals(job.id, ctx), before);
});

test('real D1: reviewed plan changes during lookup reject before creating any custody', async t => {
  const r = await runtime(t), ctx = r.context(), plan = await planD1Import(source(1), mapping, ctx), db = r.db();
  const wrap = (statement: any): any => ({
    bind(...params: any[]) { return wrap(statement.bind(...params)); },
    async first() { const result = await statement.first(); plan.source.artifacts[0].name = 'changed-after-review.json'; return result; },
    all() { return statement.all(); },
  });
  const racing = {
    prepare(query: string) { const statement = db.prepare(query); return query.startsWith('SELECT * FROM ik_jobs WHERE destination=') ? wrap(statement) : statement; },
    batch(statements: any[]) { return db.batch(statements); },
  };
  await assert.rejects(createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint, storage: { ...ctx.storage, database: racing } }), /REVIEW_FINGERPRINT_MISMATCH/);
  for (const table of ['ik_jobs','ik_d1_plan_chunks','ik_original_sets','ik_originals','ik_d1_original_chunks','ik_d1_assertions']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0, table);
});
