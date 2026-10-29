import test from 'node:test';
import { fullScale } from './scale-size.ts';
const count = fullScale ? 1001 : 25;
const batch = fullScale ? 10 : 2;
import assert from 'node:assert/strict';
import { scaleTargets as targets } from './scale-adapter.ts';
import { runtime, source, mapping } from './fixtures.ts';
import { meter } from './meter.ts';
import { canonicalJson, sha256, planD1Import, createD1ImportJob, resumeD1Import, undoD1Import, readD1PersistedImport } from '../../src/d1/index.ts';

test('real D1: complete public requests stay bounded across resumable entries', async t => {
  const r = await runtime(t); let m = meter(r.db()); const meters = [m];
  const context = () => ({ ...r.context(), batchSize: batch, maxBatches: 1, storage: { database: m.database, targets } });
  const plan = await m.request('plan', () => planD1Import(source(count), mapping, context()));
  let job = await m.request('create', () => createD1ImportJob(plan, { ...context(), reviewedFingerprint: plan.fingerprint }));
  while (job.state !== 'completed') {
    const prior = job.checkpoint;
    if ([batch, count - 1].includes(prior)) { await r.reopen(); m = meter(r.db()); meters.push(m); }
    job = await m.request(`resume:${prior}`, () => resumeD1Import(job.id, context()));
    assert.ok(job.checkpoint > prior); assert.ok(job.checkpoint <= count);
  }
  assert.equal(job.checkpoint, count);
  assert.equal((await m.request('terminal-resume', () => resumeD1Import(job.id, context()))).state, 'completed');
  assert.equal((await m.request('reopen-create', () => createD1ImportJob(plan, { ...context(), reviewedFingerprint: plan.fingerprint }))).id, job.id);
  const exported = await m.request('export', () => readD1PersistedImport(context()));
  assert.equal(exported.rows.length, count); assert.equal(exported.provenance.length, count);
  const byId = (a: any, b: any) => a.targetId.localeCompare(b.targetId);
  const expected = plan.entries.flatMap(entry => entry.effects.map((effect, index) => ({ destination: plan.destination, targetKind: effect.targetKind, targetId: effect.targetId, value: effect.value, revision: sha256(canonicalJson([job.id, entry.identity, index, 'applied'])) })));
  assert.deepEqual(exported.rows.sort(byId), expected.sort(byId));
  assert.deepEqual(exported.provenance.map(p => p.targetId).sort(), expected.map(e => e.targetId).sort());
  assert.ok(exported.provenance.every(p => p.jobId === job.id));
  let duplicate = await m.request('duplicate-create', () => createD1ImportJob(plan, { ...context(), operationKey: 'duplicate', reviewedFingerprint: plan.fingerprint }));
  while (duplicate.state !== 'completed') duplicate = await m.request('duplicate-resume', () => resumeD1Import(duplicate.id, context()));
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_entries WHERE job_id=? AND owner_job_id=?').bind(duplicate.id, job.id).first())?.n, count);
  assert.equal((await m.request('duplicate-undo', () => undoD1Import(duplicate.id, context()))).state, 'undone');
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_sources WHERE job_id=?').bind(job.id).first())?.n, count);
  job = await m.request('undo', () => undoD1Import(job.id, context()));
  let undoRequests = 0;
  while (job.state !== 'undone') {
    if (++undoRequests === (fullScale ? 23 : 2)) { await r.reopen(); m = meter(r.db()); meters.push(m); }
    job = await m.request('undo-resume', () => resumeD1Import(job.id, context()));
  }
  assert.equal((await m.request('undone-resume', () => resumeD1Import(job.id, context()))).state, 'undone');
  for (const table of ['contacts', 'evidence', 'ik_sources']) assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0);
  const snapshots = meters.flatMap(m => m.snapshots);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE reversed=1').first())?.n, count);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_entries').first())?.n, 2 * count);
  console.log(JSON.stringify({ requests: snapshots.length, maxStatements: Math.max(...snapshots.map(s => s.count)), meter: snapshots }));
});

test('real D1: native read-heavy multiple effects stop at a durable query budget', async t => {
  const r = await runtime(t), m = meter(r.db());
  const readHeavy = { ...targets, async read(db: any, destination: string, kind: string, id: string) {
    // Native related-table reads each consume a D1 query, unlike batch members.
    for (let n = 0; n < 8; n++) await db.prepare('SELECT detail FROM evidence WHERE id=?').bind(id).first();
    return targets.read(db, destination, kind, id);
  } };
  const ctx = { ...r.context(), batchSize: 100, storage: { database: m.database, targets: readHeavy } };
  const many = { version: 'v1', map: (record: any) => ({ effects: Array.from({ length: 30 }, (_, i) => ({ targetKind: 'contact', targetId: `${record.sourceId}:${i}`, value: record.payload })) }) };
  const records = fullScale ? 10 : 4;
  const plan = await m.request('many-plan', () => planD1Import(source(records), many, ctx));
  let job = await m.request('many-create', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }));
  let requests = 0;
  while (job.state !== 'completed') { const prior = job.checkpoint; job = await m.request('many-resume', () => resumeD1Import(job.id, ctx)); assert.ok(job.checkpoint > prior); requests++; }
  assert.ok(requests > 1); assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())?.n, records * 30);
  console.log(JSON.stringify({ multiEffect: m.snapshots }));
});
