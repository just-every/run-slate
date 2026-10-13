import test from 'node:test';
import assert from 'node:assert/strict';
import { planD1Import, createD1ImportJob, readD1ImportOriginals, sha256 } from '../src/d1/index.ts';
import { sqliteRuntime, sqliteSource, sqliteMapping } from './d1/sqlite-runtime.ts';

test('original names retain embedded NULs and reject corruption after the NUL', async t => {
  const runtime = await sqliteRuntime(t), source = sqliteSource(0);
  const bytes = Buffer.from([0, 255, 13, 10, 42]);
  const name = '🌱\u0000"\\\n漢';
  source.artifacts = [{ name, size: bytes.length, sha256: sha256(bytes), original: { status: 'available', base64: bytes.toString('base64') } }];
  const plan = await planD1Import(source, sqliteMapping, runtime.context());
  const job = await createD1ImportJob(plan, { ...runtime.context(), reviewedFingerprint: plan.fingerprint });
  runtime.reopen();
  const originals = await readD1ImportOriginals(job.id, runtime.context());
  assert.equal(originals[0].name, name);
  assert.deepEqual(originals[0].original, { status: 'retained', base64: bytes.toString('base64') });
  runtime.native().prepare('UPDATE ik_originals SET name=? WHERE job_id=?').run('🌱\u0000changed', job.id);
  await assert.rejects(readD1ImportOriginals(job.id, runtime.context()), /ORIGINAL_CUSTODY_MISMATCH/);
});
