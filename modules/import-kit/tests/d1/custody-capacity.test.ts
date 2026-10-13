import test from 'node:test';
import { fullScale } from './scale-size.ts';
const count = fullScale ? 20 : 2;
import assert from 'node:assert/strict';
import { runtime, source, mapping } from './fixtures.ts';
import { meter } from './meter.ts';
import { planD1Import, preflightD1ImportJob, createD1ImportJob, readD1ImportOriginals, resumeD1Import, undoD1Import, sha256 } from '../../src/d1/index.ts';

test('real D1: exact originals fit atomic custody and full lifecycle within every invocation limit', async t => {
  const r = await runtime(t), m = meter(r.db()), ctx = { ...r.context(), batchSize: count, storage: { ...r.context().storage, database: m.database } };
  const size = fullScale ? 10 * 1024 * 1024 : 1024, bundle = source(count);
  bundle.artifacts = Array.from({ length: count }, (_, i) => {
    const bytes = Buffer.alloc(size, 120);
    bytes.write(`id,email,evidence,ignored\n${i},person${i}@example.test,historical export,`);
    return { name: `original-${i}.csv`, size, sha256: sha256(bytes), original: { status: 'available' as const, base64: bytes.toString('base64') } };
  });
  // The parsed record need not reproduce the ignored columns of an exact file.
  bundle.records.forEach((record, i) => { record.artifactHash = bundle.artifacts[i].sha256; record.location.artifact = bundle.artifacts[i].name; });
  const plan = await m.request('capacity-plan', () => planD1Import(bundle, mapping, ctx));
  const admission = preflightD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint });
  const job = await m.request('capacity-create', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }));
  assert.equal(m.snapshots.at(-1).count, admission.totalExecutions);
  assert.equal((await m.request('capacity-replay', () => createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }))).id, job.id);
  assert.equal((await m.request('capacity-resume', () => resumeD1Import(job.id, ctx))).state, 'completed');
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())?.n, count);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE reversed=0').first())?.n, count);
  assert.equal((await m.request('capacity-undo', () => undoD1Import(job.id, ctx))).state, 'undone');
  const originals = await m.request('capacity-read-after-undo', () => readD1ImportOriginals(job.id, ctx));
  assert.equal(originals.length, count);
  for (const [i, original] of originals.entries()) {
    assert.equal(original.name, bundle.artifacts[i].name); assert.equal(original.size, size); assert.equal(original.sha256, bundle.artifacts[i].sha256);
    assert.deepEqual(original.original, { status: 'retained', base64: (bundle.artifacts[i].original as any).base64 });
  }
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM contacts').first())?.n, 0);
  assert.ok(m.snapshots.every(s => s.count <= 1000 && s.bindings <= 100 && s.sqlBytes <= 100000 && s.valueBytes <= 2000000));
  console.log(JSON.stringify({ maximumCustodyBytes: count * size, admission, requests: m.snapshots }));
});
