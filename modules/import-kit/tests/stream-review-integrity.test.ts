import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './d1/fixtures.ts';
import { planD1ImportStream, createD1ImportStream } from '../src/d1/index.ts';
import { compressedPlan, expandCompressedPlan, streamView } from '../src/d1/stream-plan.ts';
import { planFingerprint } from '../src/plan/index.ts';
import type { D1PlanCodec, ImportPlan, Json } from '../src/d1/index.ts';

test('a reviewed stream cache never approves mutated header, page, layout or record custody', async t => {
  const r = await runtime(t), bundle = source(103);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  let calls = 0;
  const plan = await planD1ImportStream(bundle, { version: mapping.version, map(record) { calls++; return mapping.map(record); } }, r.context());
  assert.equal(calls, 103);
  const original = { header: structuredClone(plan.header), pages: [...plan.pages], lengths: [...plan.lengths] };
  const mutations = [
    () => { plan.header.counts.mapped++; },
    () => { plan.header.source.artifacts[0].size++; },
    () => { plan.pages.reverse(); },
    () => { plan.lengths.reverse(); },
    () => { plan.pages.pop(); },
    () => { plan.pages.push(plan.pages[0]); plan.lengths.push(0); },
    () => { const page = expandCompressedPlan(plan.pages[0]); page.entries[0].source.payload = { changed: true }; page.fingerprint = planFingerprint(page); plan.pages[0] = compressedPlan(page); },
  ];
  for (const mutate of mutations) {
    plan.header = structuredClone(original.header); plan.pages = [...original.pages]; plan.lengths = [...original.lengths];
    mutate();
    await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint }));
    for (const table of ['ik_jobs','ik_d1_streams','ik_d1_stream_pages','ik_d1_plan_chunks','ik_d1_plan_index','ik_originals']) assert.equal((await r.db().prepare(`SELECT COUNT(*) n FROM ${table}`).first())!.n, 0);
  }
  plan.header = structuredClone(original.header); plan.pages = original.pages; plan.lengths = original.lengths;
  bundle.records[0].payload = { changedAfterReview: true };
  assert.notDeepEqual(streamView(plan).entries[0].source.payload, bundle.records[0].payload);
  await createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
  assert.equal(calls, 103);
});

test('publication refuses accessor-backed pages that change after the private snapshot', async t => {
  const r = await runtime(t), bundle = source(3);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  const stream = await planD1ImportStream(bundle, mapping, r.context());
  const original = stream.pages[0], changed = expandCompressedPlan(original);
  changed.entries[0].effects[0].value = { unreviewed: true };
  changed.fingerprint = planFingerprint(changed);
  const replacement = compressedPlan(changed);
  let reads = 0;
  Object.defineProperty(stream.pages, '0', { get: () => ++reads === 1 ? original : replacement, configurable: true });
  await assert.rejects(createD1ImportStream(stream, { ...r.context(), reviewedFingerprint: stream.fingerprint }), /REVIEW_FINGERPRINT_MISMATCH/);
  assert.ok(reads > 1);
  for (const table of ['ik_jobs','ik_d1_streams','ik_d1_stream_pages','ik_d1_staging']) assert.equal((await r.db().prepare(`SELECT COUNT(*) n FROM ${table}`).first())!.n, 0);
});

test('an exact replay still refuses missing or changed codec implementations', async t => {
  const r = await runtime(t), bundle = source(3);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  const codec: D1PlanCodec = { id: 'identity-v1', encode: plan => plan as unknown as Json, decode: payload => structuredClone(payload) as unknown as ImportPlan };
  const context = { ...r.context(), storage: { database: r.db(), targets: { ...targets, planCodec: codec } } };
  const stream = await planD1ImportStream(bundle, mapping, context);
  const reviewed = { ...context, reviewedFingerprint: stream.fingerprint };
  const job = await createD1ImportStream(stream, reviewed);
  await assert.rejects(createD1ImportStream(stream, { ...reviewed, storage: { database: r.db(), targets } }), /IMPORT_PLAN_CODEC_REQUIRED/);
  const decode = codec.decode;
  codec.decode = payload => { const plan = decode(payload); plan.entries[0].effects[0].value = { changed: true }; return plan; };
  await assert.rejects(createD1ImportStream(stream, reviewed), /STORED_PLAN_CHANGED/);
  codec.decode = decode;
  assert.equal((await createD1ImportStream(stream, reviewed)).id, job.id);
  assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_d1_streams').first())!.n, 1);
});
