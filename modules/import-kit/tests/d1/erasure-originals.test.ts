import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteTargets, sqliteMapping } from './sqlite-runtime.ts';
import { readApiSource } from '../../src/readers/index.ts';
import { planD1Import, createD1ImportJob, resumeD1Import, undoD1Import, eraseD1ImportTarget, readD1ImportOriginals, readD1ImportJob, readD1PersistedImport, readD1ImportUndoReport, planD1ImportStream, prepareD1ImportStream, publishD1ImportPreparation, canonicalJson } from '../../src/d1/index.ts';

const planted = ['Person-ERASE-ME', 'erase-me@example.test', 'Answer-ERASE-ME'];
async function fixture(t:any, bounded:boolean, contributingPage = false) {
  const r = await sqliteRuntime(t);
  const pages = [JSON.stringify({ wrapper:'padding'.repeat(15000), records: [{ id:'0', name:planted[0], email:planted[1], answer:planted[2] }, { id:'1', name:'Peer', answer:'keep' }], next:'https://source.test/peer' }), JSON.stringify({ wrapper:'unrelated'.repeat(15000)+(contributingPage?planted.join(' '):''), records: [{ id:'2', name:'Other page', answer:'keep too' }] })];
  const source = await readApiSource({ namespace:'archive', url:`https://source.test/${planted[1]}`, parsePage:(value:any) => ({ records:value.records.map((p:any)=>({kind:'record',sourceId:p.id,payload:p})), next:value.next }) }, async request => new Response(pages[request.url.endsWith('/peer') ? 1 : 0], { headers:{'content-type':'application/json'} }));
  const context = () => ({ ...r.context(), ...(bounded ? {maxBatchBytes:2*1024*1024}:{}), reversalPolicy:'preserve-conflicts' as const, originalErasurePolicy:'withdraw-affected-artifacts' as const });
  r.native().prepare('INSERT INTO native_records VALUES(?,?,?,?,?)').run('workspace','record','0','before',canonicalJson({name:planted[0],email:planted[1],answer:planted[2]}));
  const mapping = {version:'v1',map:(record:any)=>({effects:sqliteMapping.map(record).effects.map(effect=>record.sourceId==='0'?{...effect,expectedRevision:'before'}:effect)})};
  const plan = await planD1Import(source, mapping, context());
  const job = await createD1ImportJob(plan, {...context(),reviewedFingerprint:plan.fingerprint});
  await resumeD1Import(job.id,{...context(),batchSize:2,maxBatches:1});
  return {...r, context, source, pages, plan, job};
}
function retained(r:any) {
  const tables = r.native().prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'ik_%' OR name LIKE 'native_%') ORDER BY name").all();
  return tables.map((row:any)=>[row.name,r.native().prepare(`SELECT * FROM ${row.name}`).all()]);
}
function noPrivateValues(r:any) {
  const rows = retained(r);
  const text = JSON.stringify(rows);
  for(const value of planted) assert.ok(!text.includes(value),value);
  // Decode every retained original, including chunk boundaries. Plan chunks
  // contain canonical JSON and are separately included in the table inventory.
  const chunks=r.native().prepare('SELECT job_id,kind,original_key,bytes FROM ik_d1_original_chunks ORDER BY job_id,kind,original_key,ordinal').all();
  const groups=new Map<string,string>();
  for(const row of chunks){const key=canonicalJson([row.job_id,row.kind,row.original_key]);groups.set(key,(groups.get(key)??'')+row.bytes);}
  const bodies = rows.flatMap(([, records]:any)=>records.flatMap((row:any)=>Object.values(row).filter((value): value is string => typeof value === 'string')));
  bodies.push(r.native().prepare('SELECT body FROM ik_d1_plan_chunks ORDER BY job_id,ordinal').all().map((row:any)=>row.body).join(''));
  for(const text of bodies)for(const match of text.matchAll(/"base64":"([^"]+)"/g))for(const value of planted)assert.ok(!Buffer.from(match[1],'base64').toString().includes(value),`plan original ${value}`);
  for(const body of groups.values())for(const value of planted)assert.ok(!Buffer.from(body,'base64').toString().includes(value),`decoded ${value}`);
}
for(const bounded of [false,true])test(`public D1 privacy withdrawal retains peers and resumes exact API custody (${bounded?'bounded':'unbounded'})`,async t=>{
  const r=await fixture(t,bounded),erase=()=>eraseD1ImportTarget('record','0',sqliteTargets.remove('workspace','record','0'),r.context());
  const originals=await readD1ImportOriginals(r.job.id,r.context());
  assert.equal(originals[0].original.status,'retained');
  if(originals[0].original.status==='retained')assert.equal(Buffer.from(originals[0].original.base64,'base64').toString(),r.pages[0]);
  const before=retained(r),strict={...r.context()};delete (strict as any).originalErasurePolicy;
  const changes=r.native().prepare('SELECT total_changes() n').get()!.n;
  await assert.rejects(eraseD1ImportTarget('record','0',sqliteTargets.remove('workspace','record','0'),strict),/IMPORT_ERASURE_RETAINED_ORIGINAL/);
  assert.deepEqual(retained(r),before);
  assert.equal(r.native().prepare('SELECT total_changes() n').get()!.n,changes);
  for(const fault of ['authority','failure']){
    r.native().exec(fault==='authority'?"CREATE TRIGGER fault AFTER DELETE ON native_records BEGIN UPDATE native_authority SET enabled=0; END":"CREATE TRIGGER fault AFTER DELETE ON ik_d1_original_chunks BEGIN SELECT RAISE(ABORT,'injected original deletion failure'); END");
    await assert.rejects(erase(),/IMPORT_ATOMIC_GUARD|injected original deletion failure/);
    assert.deepEqual(retained(r),before);
    r.native().exec('DROP TRIGGER fault');
  }
  assert.equal((await erase()).erasedRecords,1);
  noPrivateValues(r);
  const after=await readD1ImportOriginals(r.job.id,r.context());
  assert.deepEqual(after[0].original,{status:'unavailable',reason:'unavailable-after-erasure',policy:'withdraw-affected-artifacts'});
  assert.deepEqual(after[1],originals[1]);
  assert.deepEqual((await sqliteTargets.read(r.db(),'workspace','record','1'))!.value,r.source.records[1].payload);
  r.reopen();await resumeD1Import(r.job.id,r.context());
  assert.equal(await sqliteTargets.read(r.db(),'workspace','record','0'),undefined);
  assert.equal((await readD1ImportJob(r.job.id,r.context())).state,'completed');
  assert.deepEqual((await sqliteTargets.read(r.db(),'workspace','record','2'))!.value,r.source.records[2].payload);
  assert.equal((await readD1PersistedImport(r.context())).provenance.length,2);
  await assert.rejects(createD1ImportJob(r.plan,{...r.context(),operationKey:'reimport',reviewedFingerprint:r.plan.fingerprint}),/IMPORT_SOURCE_ERASED/);
  await undoD1Import(r.job.id,r.context());
  noPrivateValues(r);
  assert.equal(await sqliteTargets.read(r.db(),'workspace','record','0'),undefined);
  assert.equal((await readD1ImportOriginals(r.job.id,r.context()))[0].original.status,'unavailable');
});

for(const bounded of [false,true])test(`public privacy withdrawal removes prior images, preserved reports and pending preparation (${bounded})`,async t=>{
  const r=await fixture(t,bounded);
  await resumeD1Import(r.job.id,r.context());
  r.native().exec("UPDATE native_records SET revision='edited'");
  await undoD1Import(r.job.id,r.context());
  assert.ok(JSON.stringify(await readD1ImportUndoReport(r.job.id,r.context())).includes(planted[0]));
  const normalized=structuredClone(r.source);
  normalized.artifacts.forEach(artifact=>artifact.original={status:'unavailable',reason:'not-supplied'});
  const review=await planD1ImportStream(normalized,sqliteMapping,r.context());
  const prepared=await prepareD1ImportStream(normalized,sqliteMapping,{...r.context(),operationKey:'pending',reviewedFingerprint:review.fingerprint});
  assert.ok(r.native().prepare('SELECT count(*) n FROM ik_d1_staging_chunks').get()!.n);
  await eraseD1ImportTarget('record','0',sqliteTargets.remove('workspace','record','0'),r.context());
  noPrivateValues(r);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_staging').get()!.n,0);
  const report=await readD1ImportUndoReport(r.job.id,r.context());
  assert.ok(report.dispositions.some(d=>d.redacted==='erased'));
  assert.ok(await sqliteTargets.read(r.db(),'workspace','record','1'));
  await assert.rejects(publishD1ImportPreparation(prepared.id,r.context()));
  await resumeD1Import(r.job.id,r.context());
  noPrivateValues(r);
});

// A consumer codec is for normalized plans; remaining exact raw artifacts stay
// in canonical original-bearing custody even when the native adapter has a codec.
test('withdrawal preserves unrelated raw custody with a consumer plan codec',async t=>{
  const r=await fixture(t,true),base=r.context();
  const context={...base,storage:{...base.storage,targets:{...sqliteTargets,planCodec:{id:'identity',encode:(plan:any)=>plan,decode:(plan:any)=>plan}}}};
  await eraseD1ImportTarget('record','0',sqliteTargets.remove('workspace','record','0'),context);
  assert.equal((await readD1ImportOriginals(r.job.id,context))[1].original.status,'retained');
  await resumeD1Import(r.job.id,context);
  noPrivateValues(r);
});

for(const bounded of [false,true])test(`all-job withdrawal covers a second contributing raw page without deleting peers (${bounded})`,async t=>{
  const r=await fixture(t,bounded,true),context={...r.context(),originalErasurePolicy:'withdraw-all-job-artifacts' as const};
  await eraseD1ImportTarget('record','0',sqliteTargets.remove('workspace','record','0'),context);
  noPrivateValues(r);
  const originals=await readD1ImportOriginals(r.job.id,context);
  assert.ok(originals.every(original=>original.original.status==='unavailable'&&original.original.reason==='unavailable-after-erasure'&&original.original.policy==='withdraw-all-job-artifacts'));
  const bound=retained(r);
  await assert.rejects(eraseD1ImportTarget('record','0',sqliteTargets.remove('workspace','record','0'),{...context,originalErasurePolicy:'withdraw-affected-artifacts'}),/IMPORT_ORIGINAL_ERASURE_POLICY_CONFLICT/);
  assert.deepEqual(retained(r),bound);
  await resumeD1Import(r.job.id,context);
  assert.deepEqual((await sqliteTargets.read(r.db(),'workspace','record','1'))!.value,r.source.records[1].payload);
  assert.deepEqual((await sqliteTargets.read(r.db(),'workspace','record','2'))!.value,r.source.records[2].payload);
  await eraseD1ImportTarget('record','0',sqliteTargets.remove('workspace','record','0'),context);
  noPrivateValues(r);
  assert.deepEqual(await readD1ImportOriginals(r.job.id,context),originals);
});
