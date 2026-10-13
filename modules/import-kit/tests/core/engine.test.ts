import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport } from '../../src/plan/index.ts';
import { createImportJob, applyImportBatches, undoImport, rollbackImport, resumeImport, readImportJob } from '../../src/engine/index.ts';
import { readPersistedImport, sqliteTargets } from '../../src/storage/sqlite.ts';
import { reconcileImport } from '../../src/reconcile/index.ts';
import { canonicalJson, sha256 } from '../../src/provenance/identity.ts';
import { setup, source, mapping, context } from './fixtures.ts';
async function reviewed(ctx:any,count=4,map=mapping) {const plan=planImport(source(count),map,ctx);ctx.reviewedFingerprint=plan.fingerprint;return {plan,job:await createImportJob(plan,ctx)};}

test('dry run reports every outcome and duplicate, with no write',async t=>{
  const {ctx}=setup(t),input=source();input.records.push({...input.records[0]});
  const plan=planImport(input,{version:'v1',map:r=>r.sourceId==='1'?{effects:[],unmapped:[{field:'unknown',reason:'Unsupported field'}]}:r.sourceId==='2'?{effects:[],rejection:'Unsupported shape'}:mapping.map(r)},ctx);
  assert.deepEqual(plan.counts,{input:5,unique:4,duplicates:1,mapped:2,unmapped:1,rejected:1,effects:2,byKind:{item:4}});
  assert.equal(plan.diagnostics.filter(d=>d.location&&d.sourceId).length,3);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_jobs').get().n,0);
  const conflict=structuredClone(input);conflict.records[4].payload={changed:true};conflict.records[4].payloadHash=sha256(canonicalJson(conflict.records[4].payload));
  assert.throws(()=>planImport(conflict,mapping,ctx),/DUPLICATE_SOURCE_CONFLICT/);
});

test('bounded durable apply, one-to-many provenance, restart and repeat undo',async t=>{
  const {ctx,path}=setup(t);const map={version:'v1',map:r=>({effects:[...mapping.map(r).effects,{targetKind:'relation',targetId:r.sourceId,value:{parent:r.sourceId}}]})};
  const {plan,job}=await reviewed(ctx,4,map);ctx.maxBatches=1;
  assert.equal((await applyImportBatches(job,ctx)).checkpoint,1);
  ctx.storage.close();ctx.storage=context(path).storage;delete ctx.maxBatches;
  assert.equal((await resumeImport(job.id,ctx)).state,'completed');
  const persisted=readPersistedImport(ctx);assert.equal(persisted.rows.length,8);assert.equal(persisted.provenance.length,8);assert.equal(reconcileImport(plan,persisted,ctx).ok,true);
  await applyImportBatches(job.id,ctx);assert.equal(readPersistedImport(ctx).rows.length,8);
  ctx.maxBatches=1;assert.equal((await undoImport(job.id,ctx)).state,'undoing');delete ctx.maxBatches;
  assert.equal((await resumeImport(job.id,ctx)).state,'undone');assert.equal((await undoImport(job.id,ctx)).state,'undone');assert.deepEqual(readPersistedImport(ctx),{rows:[],provenance:[]});
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_stages').get().n,0);await assert.rejects(applyImportBatches(job.id,ctx),/ALREADY_REVERSING/);
});

test('review, namespace, mapping, destination, principal and live authority bind work',async t=>{
  const {ctx}=setup(t),{plan,job}=await reviewed(ctx),changed=structuredClone(plan);changed.entries[0].effects[0].value={tampered:true};
  await assert.rejects(createImportJob(changed,ctx),/FINGERPRINT/);
  for(const override of [{destination:'elsewhere'},{namespace:'other'},{mappingVersion:'v2'},{authorization:{...ctx.authorization,principalId:'other'}}]) await assert.rejects(applyImportBatches(job.id,{...ctx,...override}),/BINDING/);
  ctx.storage.database.prepare('UPDATE test_authority SET permitted=0').run();await assert.rejects(applyImportBatches(job.id,ctx),/NOT_AUTHORIZED/);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_targets').get().n,0);
  ctx.storage.database.prepare('UPDATE test_authority SET permitted=1').run();await applyImportBatches(job.id,ctx);
  ctx.storage.database.prepare('UPDATE test_authority SET permitted=0').run();await assert.rejects(undoImport(job.id,ctx),/NOT_AUTHORIZED/);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_targets').get().n,4);
});

test('source ID rejects changed content and rollback preserves earlier job effects',async t=>{
  const {ctx}=setup(t),{job}=await reviewed(ctx,2);await applyImportBatches(job.id,ctx);
  const input=source(2);input.records[0].payload={new:'value'};input.records[0].payloadHash=sha256(canonicalJson(input.records[0].payload));
  const plan=planImport(input,mapping,ctx);ctx.reviewedFingerprint=plan.fingerprint;const next=await createImportJob(plan,ctx);
  await assert.rejects(applyImportBatches(next,ctx),/SOURCE_ID_CONTENT_CONFLICT/);assert.equal(readImportJob(next.id,ctx).checkpoint,0);
  await rollbackImport(next.id,ctx);assert.equal(readPersistedImport(ctx).rows.length,2);
});

test('SQL trigger failure rolls back effects and journal together; explicit rollback reverses earlier batches',async t=>{
  const {ctx}=setup(t),{job}=await reviewed(ctx);ctx.storage.database.exec("CREATE TRIGGER fail_second BEFORE INSERT ON ik_targets WHEN NEW.id='1' BEGIN SELECT RAISE(ABORT,'synthetic write rejection'); END;");
  await assert.rejects(applyImportBatches(job,ctx),/synthetic write rejection/);assert.equal(readImportJob(job.id,ctx).checkpoint,1);
  for(const table of ['ik_provenance','ik_batches','ik_targets'])assert.equal(ctx.storage.database.prepare(`SELECT count(*) n FROM ${table}`).get().n,1);
  await rollbackImport(job.id,ctx);assert.equal(readPersistedImport(ctx).rows.length,0);
});

test('undo restores full before-image and preserves a later native edit as conflict',async t=>{
  const {ctx}=setup(t),before={destination:ctx.destination,targetKind:'item',targetId:'0',revision:'native-v1',value:{old:'original'},attachment:{base64:'b2xk',sha256:sha256('old'),mediaType:'text/plain'}};
  sqliteTargets.write(ctx.storage.database,before);const replace={version:'v1',map:r=>({effects:mapping.map(r).effects.map(e=>({...e,expectedRevision:'native-v1'}))})};
  const {job}=await reviewed(ctx,1,replace);await applyImportBatches(job,ctx);const imported=sqliteTargets.read(ctx.storage.database,ctx.destination,'item','0')!;
  sqliteTargets.write(ctx.storage.database,{...imported,value:{native:'later'}});await assert.rejects(undoImport(job.id,ctx),/NATIVE_EDIT_CONFLICT/);
  assert.deepEqual(sqliteTargets.read(ctx.storage.database,ctx.destination,'item','0')!.value,{native:'later'});
  sqliteTargets.write(ctx.storage.database,imported);await resumeImport(job.id,ctx);assert.deepEqual(sqliteTargets.read(ctx.storage.database,ctx.destination,'item','0'),before);
});

test('concurrent callers cannot duplicate effects',async t=>{
  const {ctx}=setup(t),{job}=await reviewed(ctx,20);const outcomes=await Promise.allSettled([applyImportBatches(job.id,ctx),applyImportBatches(job.id,ctx)]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.match((outcomes.find(o=>o.status==='rejected') as PromiseRejectedResult).reason.message,/LEASE_BUSY/);
  assert.equal(readPersistedImport(ctx).rows.length,20);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_batches').get().n,20);
});

test('reconciliation detects same-count corruption, missing/duplicate/extra provenance and original hashes',async t=>{
  const {ctx}=setup(t),{job,plan}=await reviewed(ctx,2);await applyImportBatches(job.id,ctx);const good=readPersistedImport(ctx);
  assert.equal(reconcileImport(plan,good,ctx).ok,true);const changed=structuredClone(good);changed.rows[0].value={wrong:true};changed.rows[1].attachment!.base64='Yg==';changed.provenance[0].sourceId='wrong';assert.ok(reconcileImport(plan,changed,ctx).mismatched.length>=3);
  const missing=structuredClone(good);missing.rows[0].targetId='unrelated';missing.provenance.pop();const report=reconcileImport(plan,missing,ctx);assert.ok(report.extra.length);assert.ok(report.missing.length);
  good.rows.push(good.rows[0]);good.provenance.push(good.provenance[0]);assert.equal(reconcileImport(plan,good,ctx).duplicate.length,2);
});

test('rejects durable credentials, grants, jobs and activated imported identities',async t=>{
  const {ctx}=setup(t);for(const effect of [{targetKind:'dispatch_jobs',targetId:'x',value:{}},{targetKind:'operators',targetId:'x',value:{active:1}}])assert.throws(()=>planImport(source(1),{version:'v1',map:()=>({effects:[effect]})},ctx),/ACTIVE_EFFECT/);
  const input=source(1);input.records[0].payload={access_token:'test-secret'};input.records[0].payloadHash=sha256(canonicalJson(input.records[0].payload));assert.throws(()=>planImport(input,mapping,ctx),/CREDENTIAL/);
  await assert.rejects(createImportJob(planImport(source(1),mapping,ctx),ctx),/FINGERPRINT/);
});

test('safe native data can stay active without activating historical principals',async t=>{
  const {ctx}=setup(t);const plan=planImport(source(1),{version:'v1',map:r=>({effects:[{targetKind:'ticket_forms',targetId:r.sourceId,value:{active:1}}]})},ctx);
  ctx.reviewedFingerprint=plan.fingerprint;const job=await createImportJob(plan,ctx);await applyImportBatches(job,ctx);assert.deepEqual(readPersistedImport(ctx).rows[0].value,{active:1});
});

test('operation key conflicts and reused source mapping changes are explicit',async t=>{
  const {ctx}=setup(t);ctx.operationKey='owner-request';const {job}=await reviewed(ctx,1);await applyImportBatches(job,ctx);
  const plan=planImport(source(2),mapping,ctx);ctx.reviewedFingerprint=plan.fingerprint;await assert.rejects(createImportJob(plan,ctx),/OPERATION_KEY_CONFLICT/);
  delete ctx.operationKey;ctx.mappingVersion='v2';const changed=planImport(source(1),{...mapping,version:'v2'},ctx);ctx.reviewedFingerprint=changed.fingerprint;
  const next=await createImportJob(changed,ctx);await assert.rejects(applyImportBatches(next,ctx),/SOURCE_ID_CONTENT_CONFLICT/);
});

test('current authorization is rechecked before commit after native adapter work',async t=>{
  const {ctx}=setup(t,{...sqliteTargets,write(db,row){sqliteTargets.write(db,row);db.prepare('UPDATE test_authority SET permitted=0').run();}});
  const {job}=await reviewed(ctx,1);await assert.rejects(applyImportBatches(job,ctx),/NOT_AUTHORIZED/);
  assert.equal(readImportJob(job.id,ctx).checkpoint,0);assert.equal(readPersistedImport(ctx).rows.length,0);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_provenance').get().n,0);
});

test('strict reconciliation checks original artifact and location, even with unchanged totals',async t=>{
  const {ctx}=setup(t),{plan,job}=await reviewed(ctx,1);await applyImportBatches(job.id,ctx);
  const readback=readPersistedImport(ctx);readback.provenance[0].artifactHash='0'.repeat(64);readback.provenance[0].location.row=999;
  assert.match(reconcileImport(plan,readback,ctx).mismatched.join(','),/origin:/);
});

test('batches cap total effects and reject an indivisible oversized source mapping',async t=>{
  const {ctx}=setup(t);ctx.batchSize=10;ctx.maxBatches=1;
  const many={version:'v1',map:r=>({effects:Array.from({length:600},(_,i)=>({targetKind:'part',targetId:r.sourceId+':'+i,value:{part:i}}))})};
  const {job}=await reviewed(ctx,2,many);assert.equal((await applyImportBatches(job,ctx)).checkpoint,1);assert.equal(readPersistedImport(ctx).rows.length,600);
  assert.throws(()=>planImport(source(1),{version:'v1',map:()=>({effects:Array.from({length:1001},(_,i)=>({targetKind:'part',targetId:String(i),value:null}))})},ctx),/SOURCE_EFFECT_LIMIT/);
});
