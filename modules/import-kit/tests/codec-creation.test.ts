import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sqliteRuntime, sqliteTargets } from './d1/sqlite-runtime.ts';
import { planD1Import, createD1ImportJob, readD1ImportOriginals, resumeD1Import, undoD1Import, canonicalJson, sha256 } from '../src/d1/index.ts';
import type { D1PlanCodec } from '../src/d1/types.ts';
import type { SourceBundle } from '../src/types.ts';

/** Text that does not compress, so the codec's compressed plan stays large. */
const noise = (size: number, seed: string) => { const out = Buffer.alloc(size); for (let i = 0, block = 0; i < size; block++) { const h = createHash('sha256').update(seed + block).digest(); h.copy(out, i); i += h.length; } return out.toString('base64'); };
/** A normalized source: its records hold the content, no original bytes are supplied. */
function bundle(recordBytes: number): SourceBundle {
  const payloads = Array.from({length: 6}, (_, i) => ({id: String(i), title: `Page ${i}`, body: noise(recordBytes, String(i))}));
  const hash = sha256(canonicalJson(payloads));
  return {diagnostics: [], artifacts: [{name: 'export.json', sha256: hash, size: 1, original: {status: 'unavailable', reason: 'not-supplied'}}],
    records: payloads.map((payload, i) => ({namespace: 'archive', kind: 'record', sourceId: String(i), payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash, location: {artifact: 'export.json', row: i + 1}}))};
}
const mapping = {version: 'v1', map: (r: any) => ({effects: [{targetKind: 'record', targetId: r.sourceId, value: r.payload}]})};

// One plan written in one transaction, and one large enough to be staged.
for (const [name, size] of [['one transaction', 60_000], ['bounded staging', 600_000]] as const) test(`ordinary creation retains a normalized plan with the adapter's codec through ${name}`, async t => {
  const r = await sqliteRuntime(t), codec: D1PlanCodec = {id: 'identity-v1', encode: plan => plan as any, decode: plan => plan as any};
  let staged = 0;
  const database = {prepare: (query: string) => r.db().prepare(query), batch: async (members: any[]) => { staged += members.filter(m => String(m.query).startsWith('INSERT INTO ik_d1_staging_chunks(')).length; return r.db().batch(members); }};
  const context = () => ({...r.context(), batchSize: 10, storage: {database, targets: {...sqliteTargets, planCodec: codec}}});
  const source = bundle(size), plan = await planD1Import(source, mapping, context());
  const job = await createD1ImportJob(plan, {...context(), reviewedFingerprint: plan.fingerprint});
  const native = r.native(), stored = native.prepare('SELECT plan_json FROM ik_jobs WHERE id=?').get(job.id)!.plan_json as string;
  const chunks = native.prepare('SELECT body FROM ik_d1_plan_chunks WHERE job_id=? ORDER BY ordinal').all(job.id).map(row => row.body as string);
  // The retained body is the codec's compressed envelope, never the canonical plan.
  assert.equal(JSON.parse(chunks.length ? chunks.join('') : stored).codec, codec.id);
  assert.equal(staged > 0, name === 'bounded staging', 'only the large plan is staged');
  assert.equal(native.prepare('SELECT count(*) n FROM ik_d1_staging').get()!.n, 0);
  const [original] = await readD1ImportOriginals(job.id, context());
  assert.deepEqual(original.original, {status: 'unavailable', reason: 'not-supplied'});
  let current = job;
  while (current.state !== 'completed') current = await resumeD1Import(job.id, context());
  assert.equal(native.prepare('SELECT count(*) n FROM native_records').get()!.n, source.records.length);
  while (current.state !== 'undone') current = await undoD1Import(job.id, context());
  assert.equal(native.prepare('SELECT count(*) n FROM native_records').get()!.n, 0);
  assert.deepEqual((await readD1ImportOriginals(job.id, context()))[0].original, original.original);
});
