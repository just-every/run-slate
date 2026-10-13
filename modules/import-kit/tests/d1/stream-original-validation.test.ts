import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { planD1ImportStream, resumeD1ImportStream } from '../../src/d1/index.ts';
import { createD1ImportStream } from '../../src/d1/stream-create.ts';
import { compressedPlan, expandCompressedPlan, streamView, type ImportStreamPlan } from '../../src/d1/stream-plan.ts';
import { planFingerprint } from '../../src/plan/index.ts';
import { sha256 } from '../../src/provenance/identity.ts';

function changedArtifacts(original: ImportStreamPlan, change: (artifacts: any[]) => void) {
  const stream = structuredClone(original);
  change(stream.header.source.artifacts);
  stream.pages = stream.pages.map(body => {
    const plan = expandCompressedPlan(body);
    plan.source.artifacts = structuredClone(stream.header.source.artifacts);
    plan.fingerprint = planFingerprint(plan);
    return compressedPlan(plan);
  });
  stream.fingerprint = planFingerprint(streamView(stream));
  return stream;
}

test('normalized publication validates original availability and artifact metadata before retaining any custody', async t => {
  const r = await runtime(t), bundle = source(3);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  const original = await planD1ImportStream(bundle, mapping, r.context());
  for (const change of [
    artifacts => { artifacts[0].original.extra = 'Unreviewed original content'; },
    artifacts => { artifacts[0].original.status = 'unknown'; },
    artifacts => { artifacts[0].original.reason = 'other'; },
    artifacts => { artifacts[0].name = ''; },
    artifacts => { artifacts[0].sha256 = 'invalid'; },
    artifacts => { artifacts[0].size = -1; },
    artifacts => { artifacts.push(structuredClone(artifacts[0])); },
  ]) {
    const stream = changedArtifacts(original, change);
    await assert.rejects(createD1ImportStream(stream, { ...r.context(), reviewedFingerprint: stream.fingerprint }), /INVALID_|DUPLICATE_ARTIFACT/);
    for (const table of ['ik_jobs', 'ik_d1_streams', 'ik_d1_stream_pages', 'ik_d1_plan_index', 'ik_d1_plan_chunks', 'ik_original_sets', 'ik_originals', 'ik_provenance', 'contacts', 'evidence']) assert.equal((await r.db().prepare(`SELECT COUNT(*) n FROM ${table}`).first())!.n, 0);
  }
});

for (const availability of ['missing', 'unavailable']) test(`normalized ${availability} originals retain exact receipts and cold resume`, async t => {
  const r = await runtime(t), bundle = source(3);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  const original = await planD1ImportStream(bundle, mapping, r.context());
  const stream = availability === 'missing' ? changedArtifacts(original, artifacts => { delete artifacts[0].original; }) : original;
  let job = await createD1ImportStream(stream, { ...r.context(), reviewedFingerprint: stream.fingerprint });
  assert.equal((await targets.list(r.db(), 'workspace')).length, 0);
  await r.reopen();
  job = await resumeD1ImportStream(job.id, { ...r.context(), batchSize: 10 });
  assert.equal(job.state, 'completed');
  assert.equal((await targets.list(r.db(), 'workspace')).length, 3);
  assert.deepEqual((await r.db().prepare('SELECT name,sha256,size,bytes FROM ik_originals WHERE job_id=?').bind(job.id).all()).results, [{ name: bundle.artifacts[0].name, sha256: bundle.artifacts[0].sha256, size: bundle.artifacts[0].size, bytes: null }]);
});

test('normalized publication verifies all aggregate counts before retaining a parent', async t => {
  const r = await runtime(t), bundle = source(3);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  const original = await planD1ImportStream(bundle, mapping, r.context());
  for (const field of ['input', 'unique', 'duplicates', 'mapped', 'unmapped', 'rejected', 'effects', 'byKind']) {
    const stream = structuredClone(original);
    if (field === 'byKind') stream.header.counts.byKind.contact++;
    else stream.header.counts[field]++;
    stream.fingerprint = planFingerprint(streamView(stream));
    await assert.rejects(createD1ImportStream(stream, { ...r.context(), reviewedFingerprint: stream.fingerprint }), /IMPORT_STREAM_COUNTS_CHANGED/);
    for (const table of ['ik_jobs', 'ik_d1_streams', 'ik_d1_stream_pages', 'ik_d1_plan_index', 'ik_original_sets', 'ik_originals']) assert.equal((await r.db().prepare(`SELECT COUNT(*) n FROM ${table}`).first())!.n, 0);
  }
  const empty = structuredClone(original);
  empty.pages = []; empty.lengths = [];
  empty.fingerprint = planFingerprint(streamView(empty));
  await assert.rejects(createD1ImportStream(empty, { ...r.context(), reviewedFingerprint: empty.fingerprint }), /IMPORT_STREAM_LAYOUT_CHANGED/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_d1_streams').first())!.n, 0);
});

test('normalized publication rejects newly attached original bytes before any custody is retained', async t => {
  const r = await runtime(t), bundle = source(1);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  const stream = await planD1ImportStream(bundle, mapping, r.context());
  const plan = expandCompressedPlan(stream.pages[0]), bytes = Buffer.from('Unreviewed file bytes');
  plan.entries[0].effects[0].attachment = { base64: bytes.toString('base64'), sha256: sha256(bytes), mediaType: 'text/plain' };
  plan.fingerprint = planFingerprint(plan);
  stream.pages = [compressedPlan(plan)];
  stream.fingerprint = planFingerprint(streamView(stream));
  await assert.rejects(createD1ImportStream(stream, { ...r.context(), reviewedFingerprint: stream.fingerprint }), /IMPORT_STREAM_NORMALIZED_SOURCE_REQUIRED/);
  for (const table of ['ik_jobs', 'ik_d1_streams', 'ik_originals', 'ik_stages', 'ik_d1_original_chunks']) assert.equal((await r.db().prepare(`SELECT COUNT(*) n FROM ${table}`).first())!.n, 0);
});
