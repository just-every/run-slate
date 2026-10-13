import test from 'node:test';
import assert from 'node:assert/strict';
import { provenanceTransportFixture } from './provenance-transport-fixture.ts';
import { applyD1ImportBatches,createD1ImportJob,readD1ImportJob,readD1ImportUndoReport,undoD1Import } from '../../src/d1/index.ts';

test('bounded source reuse stages every legal large provenance binding and preserves owner undo',async t=>{
  const r=await provenanceTransportFixture(t,2),m=r.meter;
  assert.equal((await m.request('apply-owner',()=>applyD1ImportBatches(r.job.id,r.context()))).state,'completed');
  assert.ok(m.requests.find(row=>row.label==='apply-owner')!.privateBatches>0);r.largeProvenance();r.clean();
  const applied=await r.targets.list(r.db(),'workspace'),provenance=r.native().prepare('SELECT * FROM ik_provenance ORDER BY id').all();
  r.reopen();const copy=await m.request('create-reuse',()=>createD1ImportJob(r.plan,{...r.context(),operationKey:'reuse-large-before-images',reviewedFingerprint:r.plan.fingerprint}));
  assert.equal((await m.request('apply-reuse',()=>applyD1ImportBatches(copy.id,r.context()))).state,'completed');
  assert.ok(m.requests.find(row=>row.label==='apply-reuse')!.privateBatches>0);r.clean();
  assert.deepEqual(await r.targets.list(r.db(),'workspace'),applied);assert.deepEqual(r.native().prepare('SELECT * FROM ik_provenance ORDER BY id').all(),provenance);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_entries WHERE job_id=? AND owner_job_id=?').get(copy.id,r.job.id)!.n,1);
  r.reopen();assert.equal((await m.request('cold-reuse-read',()=>readD1ImportJob(copy.id,r.context()))).state,'completed');
  assert.equal((await m.request('undo-reuse',()=>undoD1Import(copy.id,r.context()))).state,'undone');
  assert.equal((await m.request('repeat-reuse-undo',()=>undoD1Import(copy.id,r.context()))).state,'undone');
  assert.deepEqual(await r.targets.list(r.db(),'workspace'),applied);r.clean();
  let job=await m.request('undo-owner',()=>undoD1Import(r.job.id,r.context()));
  while(job.state!=='undone')job=await m.request('continue-owner-undo',()=>undoD1Import(r.job.id,r.context()));
  assert.equal((await m.request('repeat-owner-undo',()=>undoD1Import(r.job.id,r.context()))).state,'undone');
  assert.deepEqual(await r.targets.list(r.db(),'workspace'),r.before);r.clean();console.log(JSON.stringify({largeSourceReuse:m.summary()}));
});

test('bounded preserved reversal stages multiple large before-images and retains a later edit after restart',async t=>{
  const r=await provenanceTransportFixture(t,4,true),m=r.meter;
  assert.equal((await m.request('apply-owner',()=>applyD1ImportBatches(r.job.id,r.context()))).state,'completed');r.largeProvenance();r.clean();
  assert.equal((await m.request('first-undo',()=>undoD1Import(r.job.id,{...r.context(1),maxBatches:1}))).state,'undoing');
  const first=await m.request('first-report',()=>readD1ImportUndoReport(r.job.id,r.context()));assert.equal(first.cursor,1);assert.equal(first.dispositions[0].targetId,'3');assert.equal(first.dispositions[0].disposition,'reversed');
  r.reopen();r.native().prepare('UPDATE native_parts SET body=? WHERE target_id=? AND ordinal=0').run(JSON.stringify('later edit'),'2');
  const edited=await r.targets.read(r.db(),'workspace','record','2');
  assert.equal((await m.request('mixed-large-undo',()=>undoD1Import(r.job.id,r.context(3)))).state,'undone');
  assert.ok(m.requests.find(row=>row.label==='mixed-large-undo')!.privateBatches>0);r.clean();r.reopen();
  const report=await m.request('cold-final-report',()=>readD1ImportUndoReport(r.job.id,r.context()));assert.equal(report.cursor,4);assert.equal(report.dispositions.filter(d=>d.disposition==='reversed').length,3);
  const kept=report.dispositions.find(d=>d.targetId==='2')!;assert.equal(kept.disposition,'retained');assert.equal(kept.reason,'edited');
  assert.deepEqual(await r.targets.read(r.db(),'workspace','record','2'),edited);
  for(const row of r.before.filter(row=>row.targetId!=='2'))assert.deepEqual(await r.targets.read(r.db(),'workspace','record',row.targetId),row);
  assert.equal((await m.request('repeat-mixed-undo',()=>undoD1Import(r.job.id,r.context()))).state,'undone');
  assert.deepEqual(await m.request('repeat-report',()=>readD1ImportUndoReport(r.job.id,r.context())),report);r.clean();console.log(JSON.stringify({largePreservedReversal:m.summary()}));
});
