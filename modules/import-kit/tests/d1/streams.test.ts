import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,source,mapping,targets} from './fixtures.ts';
import {planD1ImportStream,createD1ImportStream,resumeD1ImportStream,undoD1ImportStream,readD1ImportStream,eraseD1ImportTarget,planD1Import} from '../../src/d1/index.ts';
import {streamView} from '../../src/d1/stream-plan.ts';
import {canonicalJson} from '../../src/provenance/identity.ts';

test('compressed normalized pages retain the complete canonical reviewed plan and bounded native lifecycle',async t=>{
 const r=await runtime(t),bundle=source(201);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const plan=await planD1ImportStream(bundle,mapping,r.context());
 assert.equal(canonicalJson(streamView(plan)),canonicalJson(await planD1Import(bundle,mapping,r.context())));
 let job=await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
 assert.equal(job.total,201);assert.equal(plan.pages.length,3);
 let rounds=0;while(job.state!=='completed'){job=await resumeD1ImportStream(job.id,{...r.context(),batchSize:100});assert.ok(++rounds<100);}
 assert.equal((await targets.list(r.db(),'workspace')).length,201);
 await eraseD1ImportTarget('contact','100',targets.remove('workspace','contact','100'),r.context());
 assert.equal((await readD1ImportStream(job.id,r.context())).erasedRecords,1);
 assert.equal((await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint})).id,job.id);
 await assert.rejects(createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint,operationKey:'new'}));
 while(job.state!=='undone'){job=await undoD1ImportStream(job.id,{...r.context(),batchSize:100});assert.ok(++rounds<200);}
 assert.equal((await targets.list(r.db(),'workspace')).length,0);
});

test('stream layout and child direction remain fenced against direct entry points',async t=>{
 const {resumeD1Import,undoD1Import}=await import('../../src/d1/index.ts');
 const r=await runtime(t),bundle=source(101);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const plan=await planD1ImportStream(bundle,mapping,r.context()),job=await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
 const pages=(await r.db().prepare('SELECT * FROM ik_d1_stream_pages WHERE stream_id=? ORDER BY ordinal').bind(job.id).all()).results;
 await assert.rejects(resumeD1Import(pages[1].job_id,r.context()),/IMPORT_ATOMIC_GUARD/);
 assert.equal((await targets.list(r.db(),'workspace')).length,0);
 await assert.rejects(undoD1Import(pages[0].job_id,r.context()));
 await r.db().prepare("UPDATE ik_d1_streams SET state='undoing' WHERE id=?").bind(job.id).run();
 await assert.rejects(resumeD1Import(pages[0].job_id,r.context()),/IMPORT_ATOMIC_GUARD/);
 await r.db().prepare('DELETE FROM ik_d1_stream_pages WHERE stream_id=? AND ordinal=1').bind(job.id).run();
 await assert.rejects(readD1ImportStream(job.id,r.context()),/IMPORT_STREAM_LAYOUT_CHANGED/);
 await assert.rejects(resumeD1Import(pages[1].job_id,r.context()),/IMPORT_ATOMIC_GUARD/);
 await r.db().prepare('DELETE FROM ik_d1_stream_pages WHERE stream_id=?').bind(job.id).run();
 await r.db().prepare('DELETE FROM ik_d1_streams WHERE id=?').bind(job.id).run();
 await assert.rejects(resumeD1Import(pages[1].job_id,r.context()),/IMPORT_ATOMIC_GUARD/);
 await assert.rejects(undoD1Import(pages[0].job_id,r.context()));
 assert.equal((await targets.list(r.db(),'workspace')).length,0);
});

test('stream create rolls back every parent, page, source index and original on revoked authority',async t=>{
 const r=await runtime(t),bundle=source(101);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const plan=await planD1ImportStream(bundle,mapping,r.context()),ctx=r.context();let raced=false;
 const database={prepare:query=>ctx.storage.database.prepare(query),async batch(statements){if(!raced&&statements.length>3){raced=true;await r.db().prepare('UPDATE sessions SET enabled=0').run();}return ctx.storage.database.batch(statements);}};
 await assert.rejects(createD1ImportStream(plan,{...ctx,reviewedFingerprint:plan.fingerprint,storage:{...ctx.storage,database}}),/IMPORT_ATOMIC_GUARD/);
 for(const table of ['ik_jobs','ik_d1_streams','ik_d1_stream_pages','ik_d1_plan_index','ik_d1_plan_chunks','ik_original_sets','ik_originals'])assert.equal((await r.db().prepare(`SELECT COUNT(*) n FROM ${table}`).first())?.n,0);
});

for(const kind of ['source','target'])test(`stream create atomically refuses a ${kind} tombstone written after preflight`,async t=>{
 const {targetIdentity}=await import('../../src/d1/erasure-index.ts');
 const r=await runtime(t),bundle=source(101);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const plan=await planD1ImportStream(bundle,mapping,r.context()),ctx=r.context();let raced=false;
 const identity=kind==='source'?streamView(plan).entries[0].identity:targetIdentity('workspace','contact','0');
 const database={prepare:query=>ctx.storage.database.prepare(query),async batch(statements){
  if(!raced&&statements.length>3){raced=true;await r.db().prepare(`INSERT INTO ik_d1_erased_${kind}s(destination,identity) VALUES(?,?)`).bind('workspace',identity).run();}
  return ctx.storage.database.batch(statements);
 }};
 await assert.rejects(createD1ImportStream(plan,{...ctx,reviewedFingerprint:plan.fingerprint,storage:{...ctx.storage,database}}),/IMPORT_ATOMIC_GUARD/);
 assert.equal(raced,true);
 for(const table of ['ik_jobs','ik_d1_streams','ik_d1_stream_pages','ik_d1_plan_index','ik_d1_plan_chunks','ik_original_sets','ik_originals'])assert.equal((await r.db().prepare(`SELECT COUNT(*) n FROM ${table}`).first())?.n,0);
});


test('byte partition preserves Unicode values, diagnostic order and hostile dictionary keys without rerunning mapping',async t=>{
 const r=await runtime(t),bundle=source(103);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 for(const [i,record] of bundle.records.entries()){
  record.kind=i<100?'__proto__':'constructor';record.payload={email:`wide${i}@example.test`,evidence:'😀\n\"'.repeat(700)};
  record.payloadHash=(await import('../../src/provenance/identity.ts')).sha256(canonicalJson(record.payload));
 }
 let calls=0;const wide={version:'v1',map(record){calls++;return {...mapping.map(record),unmapped:[{field:'unused',reason:'Mapping retains its diagnostic order.'}]};}};
 const plan=await planD1ImportStream(bundle,wide,r.context());assert.equal(calls,103);
 assert.ok(plan.pages.length>2);assert.equal(plan.header.counts.byKind['__proto__'],100);assert.equal(plan.header.counts.byKind.constructor,3);
 assert.equal(canonicalJson(streamView(plan)),canonicalJson(await planD1Import(bundle,wide,r.context())));
 const bad={...plan,pages:[...plan.pages]};bad.pages[0]=bad.pages[0].replace(/"sha256":"[a-f0-9]/,'"sha256":"z');
 await assert.rejects(createD1ImportStream(bad,{...r.context(),reviewedFingerprint:plan.fingerprint}),/STORED_PLAN_CHANGED/);
 assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_jobs').first())?.n,0);
});

test('split native snapshots cover every byte of a large atomic entity through apply and undo',async t=>{
 const {sha256}=await import('../../src/provenance/identity.ts');
 const r=await runtime(t),bundle=source(1);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 bundle.records[0].payload={email:'a'.repeat(1_050_000),evidence:'b'.repeat(1_050_000)};
 bundle.records[0].payloadHash=sha256(canonicalJson(bundle.records[0].payload));
 const adapter={...targets,matchesParts(row,destination,kind,id){
  if(!row)return [targets.matches(null,destination,kind,id)];
  return [{sql:'EXISTS(SELECT 1 FROM contacts WHERE destination=? AND kind=? AND id=? AND revision=? AND email=?)',params:[destination,kind,id,row.revision,row.value.email]}, {sql:'EXISTS(SELECT 1 FROM evidence WHERE id=? AND detail=?)',params:[id,row.value.evidence]}];
 }};
 const ctx={...r.context(),storage:{database:r.db(),targets:adapter}},plan=await planD1ImportStream(bundle,mapping,ctx);
 let job=await createD1ImportStream(plan,{...ctx,reviewedFingerprint:plan.fingerprint});
 job=await resumeD1ImportStream(job.id,ctx);assert.equal(job.state,'completed');
 await r.db().prepare("UPDATE evidence SET detail='changed' WHERE id='0'").run();
 await assert.rejects(undoD1ImportStream(job.id,ctx),/NATIVE_EDIT_CONFLICT/);
 assert.equal((await r.db().prepare("SELECT detail FROM evidence WHERE id='0'").first()).detail,'changed');
 await r.db().prepare("UPDATE evidence SET detail=? WHERE id='0'").bind('b'.repeat(1_050_000)).run();
 job=await undoD1ImportStream(job.id,ctx);assert.equal(job.state,'undone');assert.equal((await targets.list(r.db(),'workspace')).length,0);
});

test('empty split native snapshots fail before native publication',async t=>{
 const r=await runtime(t),bundle=source(1);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const ctx={...r.context(),storage:{database:r.db(),targets:{...targets,matchesParts:()=>[]}}},plan=await planD1ImportStream(bundle,mapping,ctx);
 const job=await createD1ImportStream(plan,{...ctx,reviewedFingerprint:plan.fingerprint});
 await assert.rejects(resumeD1ImportStream(job.id,ctx),/IMPORT_NATIVE_ROW_GUARD_REQUIRED/);
 assert.equal((await targets.list(r.db(),'workspace')).length,0);
});


test('a self-consistent child cannot retain metadata or source copies outside the reviewed complete plan',async t=>{
 const {compressedPlan,expandCompressedPlan}=await import('../../src/d1/stream-plan.ts');
 const {planFingerprint}=await import('../../src/plan/index.ts');
 const r=await runtime(t),bundle=source(3);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const plan=await planD1ImportStream(bundle,mapping,r.context()),page=expandCompressedPlan(plan.pages[0]);
 page.diagnostics.push({severity:'warning',code:'PRIVATE',message:'Unreviewed retained source copy'});page.fingerprint=planFingerprint(page);
 const changed={...plan,pages:[compressedPlan(page)]};
 await assert.rejects(createD1ImportStream(changed,{...r.context(),reviewedFingerprint:plan.fingerprint}),/IMPORT_STREAM_PAGE_CHANGED/);
 assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_jobs').first()).n,0);
});

test('a page of many tiny effects splits into unit-bounded children whose preserved undo fits every request',async t=>{
 const {meter}=await import('./meter.ts');
 const r=await runtime(t),bundle=source(40);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const tiny={version:'v1',map:(record:any)=>({effects:Array.from({length:30},(_,i)=>({targetKind:'contact',targetId:`${record.sourceId}:${i}`,value:record.payload}))})};
 // Like a real native adapter, classification reads every unreversed effect of the child.
 const adapter={...targets,async preparePreservedUndo(db:any,destination:string,effects:any[]){
  const observations=[];for(const e of effects)observations.push({effectId:e.provenance.id,current:await targets.read(db,destination,e.expected.targetKind,e.expected.targetId)??null,entity:{table:'contacts',recordId:e.expected.targetId}});
  return {observations,dependencies:[],guards:observations.map(o=>targets.matches(o.current,destination,'contact',o.entity.recordId))};
 }};
 const m=meter(r.db()),ctx={...r.context(),reversalPolicy:'preserve-conflicts' as const,storage:{database:m.database,targets:adapter}};
 const plan=await m.request('plan',()=>planD1ImportStream(bundle,tiny,ctx));
 assert.ok(plan.pages.length>1,'one source page of 1,200 effects is not one child');
 let job=await m.request('create',()=>createD1ImportStream(plan,{...ctx,reviewedFingerprint:plan.fingerprint})),rounds=0;
 while(job.state!=='completed'){job=await m.request('apply',()=>resumeD1ImportStream(job.id,{...ctx,batchSize:100}));assert.ok(++rounds<500);}
 assert.equal((await targets.list(r.db(),'workspace')).length,1200);
 while(job.state!=='undone'){job=await m.request('undo',()=>undoD1ImportStream(job.id,{...ctx,batchSize:100}));assert.ok(++rounds<1000);}
 assert.equal((await targets.list(r.db(),'workspace')).length,0);
});
