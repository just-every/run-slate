import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource } from './d1/sqlite-runtime.ts';
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

test('original name custody refuses text that cannot retain its exact Unicode representation', async t => {
 const r = await sqliteRuntime(t), source = sqliteSource(0);
 source.artifacts[0].name = 'unpaired-\ud800-name';
 const plan = await planD1Import(source, sqliteMapping, r.context());
 const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
 r.reopen();
 await assert.rejects(readD1ImportOriginals(job.id, r.context()), /ORIGINAL_CUSTODY_MISMATCH/);
});
