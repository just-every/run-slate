import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource } from './sqlite-runtime.ts';
import { planD1Import, preflightD1ImportJob, createD1ImportJob, sha256, readD1ImportOriginals } from '../../src/d1/index.ts';
const custodyTables = ['ik_jobs','ik_d1_plan_chunks','ik_original_sets','ik_originals','ik_d1_original_chunks','ik_d1_assertions','ik_d1_reversal_reports','ik_d1_creation_plans'];
for (const [name, trigger] of [
  ['unreferenced plan chunk removed', 'CREATE TRIGGER corrupt_plan AFTER INSERT ON ik_d1_plan_chunks WHEN NEW.ordinal=0 BEGIN DELETE FROM ik_d1_plan_chunks WHERE job_id=NEW.job_id AND ordinal=0; END'],
  ['original bytes replaced preserving cardinality', "CREATE TRIGGER corrupt_bytes AFTER INSERT ON ik_d1_original_chunks BEGIN UPDATE ik_d1_original_chunks SET bytes='AAAA' WHERE job_id=NEW.job_id AND kind=NEW.kind AND original_key=NEW.original_key AND ordinal=NEW.ordinal; END"],
  ['original metadata changed', "CREATE TRIGGER corrupt_name AFTER INSERT ON ik_originals BEGIN UPDATE ik_originals SET name='changed' WHERE job_id=NEW.job_id; END"],
  ['creation policy changed', "CREATE TRIGGER corrupt_policy AFTER INSERT ON ik_jobs BEGIN UPDATE ik_jobs SET reversal_policy='preserve-conflicts' WHERE id=NEW.id; END"],
] as const) test(`atomic custody rejects ${name} with zero durable writes`, async t => {
  const r = await sqliteRuntime(t), ctx = r.context(), source = sqliteSource(0), bytes = Buffer.alloc(300000, 112);
  // Diagnostics occupy ordinal zero, which no original-copy descriptor uses.
  source.diagnostics = [{ code: 'padding', severity: 'warning', message: 'x'.repeat(300000) }];
  source.artifacts = [{ name: 'raw.bin', sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }];
  const plan = await planD1Import(source, sqliteMapping, ctx);
  r.native().exec(trigger);
  await assert.rejects(createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }), /IMPORT_ATOMIC_GUARD/);
  for (const table of custodyTables) assert.equal(r.native().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 0, table);
});
test('exact empty, Unicode and control originals survive fresh instance restart', async t => {
  const r = await sqliteRuntime(t), source = sqliteSource(0);
  source.artifacts = ['', '🌱\u0000"\\\n漢', 'unavailable'].map((name, i) => { const bytes = i === 0 ? Buffer.alloc(0) : Buffer.from([0, 255, 13, 10, 42]); return { name, size: bytes.length, sha256: sha256(bytes), original: i === 2 ? { status: 'unavailable' as const, reason: 'not-supplied' as const } : { status: 'available' as const, base64: bytes.toString('base64') } }; });
  // Artifact names are intentionally nonempty per the public source contract.
  source.artifacts[0].name = 'empty';
  const plan = await planD1Import(source, sqliteMapping, r.context()), ctx = { ...r.context(), reviewedFingerprint: plan.fingerprint };
  const result = preflightD1ImportJob(plan, ctx);
  assert.ok(result.totalExecutions < 20);
  const job = await createD1ImportJob(plan, ctx); r.reopen();
  const originals = await readD1ImportOriginals(job.id, r.context());
  assert.deepEqual(originals.map(o => [o.name, o.sha256, o.size, o.original]), source.artifacts.map(a => [a.name, a.sha256, a.size, a.original!.status === 'available' ? { status: 'retained', base64: a.original!.base64 } : a.original]));
});
for (const operation of ["UPDATE ik_d1_creation_plans SET body='corrupt' WHERE job_id=NEW.job_id", 'DELETE FROM ik_d1_creation_plans WHERE job_id=NEW.job_id']) test(`creation exact snapshots cannot change before guarded release: ${operation}`, async t => {
  const r = await sqliteRuntime(t), ctx = r.context(), bundle = sqliteSource(0);
  bundle.diagnostics = [{ code: 'chunked', severity: 'warning', message: 'x'.repeat(200000) }];
  const plan = await planD1Import(bundle, sqliteMapping, ctx);
  r.native().exec(`CREATE TRIGGER corrupt_snapshot AFTER INSERT ON ik_d1_creation_plans BEGIN ${operation}; END`);
  await assert.rejects(createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint }), /IMPORT_CREATION_SNAPSHOT_CHANGED/);
  for (const table of custodyTables) assert.equal(r.native().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 0, table);
});
