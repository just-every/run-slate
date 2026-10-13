import test from 'node:test';
import { fullScale } from './scale-size.ts';
const guardCount = fullScale ? 500 : 20;
const count = fullScale ? 1001 : 12;
import assert from 'node:assert/strict';
import { runtime, source } from './fixtures.ts';
import { fields, detail, wideTargets } from './wide-adapter.ts';
import { meter } from './meter.ts';
import { guard, prepare, atomic, sql } from '../../src/d1/database.ts';
import { packGuards } from '../../src/d1/budget.ts';
import { planD1Import, createD1ImportJob, resumeD1Import, readD1ImportOriginals, readD1PersistedImport } from '../../src/d1/index.ts';

test('real D1: packed wide native snapshots fit expression depth and retain every condition', async t => {
  const r = await runtime(t), db = r.db();
  await db.prepare(`CREATE TABLE details(id TEXT PRIMARY KEY,${fields.map(f => `${f} TEXT`).join(',')})`).run();
  const rows = Array.from({ length: guardCount }, (_, i) => ({ destination: 'workspace', targetKind: 'contact', targetId: String(i), revision: 'r', value: { email: `${i}@example.test`, evidence: 'source', details: detail(String(i)) } }));
  for (const row of rows) await db.batch(wideTargets.write(row).map(s => prepare(db, s)));
  const predicates = wideTargets.matchesMany!(rows, 'workspace');
  for (const p of predicates) assert.equal((await db.prepare(`SELECT (${p.sql}) AS ok`).bind(...p.params!).first())!.ok, 1);
  const packed = packGuards(predicates.map(guard));
  assert.ok(packed.length < predicates.length);
  await atomic(r.context(), 'read', predicates.map(guard));
  // Each JSON group is checked, including the last group of every packed tree.
  for (let i = 0; i < rows.length; i += 10) {
    const row = rows[i];
    await db.prepare("UPDATE details SET f17='changed' WHERE id=?").bind(row.targetId).run();
    await assert.rejects(atomic(r.context(), 'read', [sql("UPDATE evidence SET detail='must roll back' WHERE id='0'"), ...predicates.map(guard)]), /IMPORT_ATOMIC_GUARD/);
    assert.equal((await db.prepare("SELECT detail FROM evidence WHERE id='0'").first())!.detail, 'source');
    await db.prepare('UPDATE details SET f17=? WHERE id=?').bind(detail(row.targetId).f17, row.targetId).run();
  }
  await atomic(r.context(), 'read', predicates.map(guard));
});

test('real D1: wide native records retain exact originals and guarded export custody', async t => {
  const r = await runtime(t), db = r.db(), m = meter(db);
  await db.prepare(`CREATE TABLE details(id TEXT PRIMARY KEY,${fields.map(f => `${f} TEXT`).join(',')})`).run();
  const ctx = { ...r.context(), batchSize: 10, maxBatches: 1, storage: { database: m.database, targets: wideTargets } };
  const bundle = source(count);
  const mapping = { version: 'v1', map: (record: any) => ({ effects: [{ targetKind: 'contact', targetId: record.sourceId, value: { ...record.payload, details: detail(record.sourceId) } }] }) };
  const plan = await m.request('plan', () => planD1Import(bundle, mapping, ctx));
  let job = await m.request('create', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }));
  while (job.state !== 'completed') {
    const before = job.checkpoint;
    job = await m.request(`resume:${before}`, () => resumeD1Import(job.id, ctx));
    assert.ok(job.checkpoint > before);
  }
  assert.equal(job.checkpoint, count);
  const originals = await m.request('originals', () => readD1ImportOriginals(job.id, ctx));
  assert.deepEqual(originals[0].original, { ...bundle.artifacts[0].original, status: 'retained' });
  assert.equal(originals.length, bundle.artifacts.length);
  const exported = await m.request('export', () => readD1PersistedImport(ctx));
  assert.equal(exported.rows.length, count); assert.equal(exported.provenance.length, count);
  const byId = (a: any, b: any) => a.targetId.localeCompare(b.targetId);
  assert.deepEqual(exported.rows.map(row => ({ targetId: row.targetId, value: row.value })).sort(byId), plan.entries.flatMap(entry => entry.effects.map(effect => ({ targetId: effect.targetId, value: effect.value }))).sort(byId));
  const racing = { ...wideTargets, async list(...args: Parameters<typeof wideTargets.list>) {
    const rows = await wideTargets.list(...args);
    await db.prepare("UPDATE details SET f17='late change' WHERE id=?").bind(String(count - 1)).run();
    return rows;
  } };
  await assert.rejects(m.request('late-export', () => readD1PersistedImport({ ...ctx, storage: { ...ctx.storage, targets: racing } })), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await db.prepare("SELECT f17 FROM details WHERE id=?").bind(String(count - 1)).first())!.f17, 'late change');
  console.log(JSON.stringify({ wideCustody: m.snapshots.length, maxStatements: Math.max(...m.snapshots.map(s => s.count)) }));
});
