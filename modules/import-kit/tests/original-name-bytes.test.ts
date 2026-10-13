import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource } from './d1/sqlite-runtime.ts';
import { runtime, source, mapping } from './d1/fixtures.ts';
import { planD1Import, createD1ImportJob, readD1ImportOriginals } from '../src/d1/index.ts';

for (const corrupt of [false, true]) test(`original name custody rejects BLOB substitution with ${corrupt ? 'changed' : 'identical'} bytes`, async t => {
 const r = await sqliteRuntime(t), source = sqliteSource(0);
 source.artifacts[0].name = '🌱\u0000retained-name';
 const plan = await planD1Import(source, sqliteMapping, r.context());
 const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
 r.native().prepare('UPDATE ik_originals SET name=? WHERE job_id=?').run(Buffer.from(corrupt ? '🌱\u0000changed-name' : source.artifacts[0].name), job.id);
 r.reopen();
 await assert.rejects(readD1ImportOriginals(job.id, r.context()), /ORIGINAL_CUSTODY_MISMATCH/);
});

test('original name custody detects text changes beyond a NUL byte after restart', async t => {
 const r = await sqliteRuntime(t), source = sqliteSource(0);
 source.artifacts[0].name = '🌱\u0000retained-name';
 const plan = await planD1Import(source, sqliteMapping, r.context());
 const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
 r.native().prepare('UPDATE ik_originals SET name=? WHERE job_id=?').run('🌱\u0000changed-name', job.id);
 r.reopen();
 await assert.rejects(readD1ImportOriginals(job.id, r.context()), /ORIGINAL_CUSTODY_MISMATCH/);
});

test('original name custody refuses text that cannot retain its exact Unicode representation', async t => {
 const r = await sqliteRuntime(t), source = sqliteSource(0);
 source.artifacts[0].name = 'unpaired-\ud800-name';
 const plan = await planD1Import(source, sqliteMapping, r.context());
 const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
 r.reopen();
 await assert.rejects(readD1ImportOriginals(job.id, r.context()), /ORIGINAL_CUSTODY_MISMATCH/);
});

test('real D1 retains the complete Unicode and NUL name across restart and rejects a changed suffix', async t => {
 const r = await runtime(t), bundle = source(0);
 const name = '🌱\u0000"\\\n漢';
 bundle.artifacts[0].name = name;
 const plan = await planD1Import(bundle, mapping, r.context());
 const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
 await r.reopen();
 assert.equal((await readD1ImportOriginals(job.id, r.context()))[0].name, name);
 await r.db().prepare('UPDATE ik_originals SET name=? WHERE job_id=?').bind('🌱\u0000changed-suffix', job.id).run();
 await r.reopen();
 await assert.rejects(readD1ImportOriginals(job.id, r.context()), /ORIGINAL_CUSTODY_MISMATCH/);
});
