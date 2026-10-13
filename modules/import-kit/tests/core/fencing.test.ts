import test from 'node:test';
import assert from 'node:assert/strict';
import { setup,source,mapping } from './fixtures.ts';
import { planImport } from '../../src/plan/index.ts';
import { createImportJob } from '../../src/engine/index.ts';
import { claimJob,guardClaim,releaseClaim } from '../../src/journal/jobs.ts';

test('expired holder cannot publish or delete a newer fence staging area',async t=>{
  const {ctx}=setup(t),plan=planImport(source(1),mapping,ctx);ctx.reviewedFingerprint=plan.fingerprint;const job=await createImportJob(plan,ctx);
  ctx.leaseMs=10;const first=claimJob(job.id,'apply',ctx);assert.ok('token' in first);
  await new Promise(resolve=>setTimeout(resolve,20));ctx.leaseMs=1000;const next=claimJob(job.id,'apply',ctx);assert.ok('token' in next);
  ctx.storage.database.prepare('INSERT INTO ik_stages(job_id,fence,effect_id,sha256,bytes) VALUES(?,?,?,?,?)').run(job.id,next.fence,'new','hash',Buffer.from('new'));
  assert.throws(()=>ctx.storage.transaction(()=>guardClaim(first,ctx)),/LEASE_LOST/);releaseClaim(first,ctx,true);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_stages WHERE fence=?').get(next.fence).n,1);
  assert.equal(ctx.storage.database.prepare('SELECT lease_token FROM ik_jobs WHERE id=?').get(job.id).lease_token,next.token);
  releaseClaim(next,ctx);
});
