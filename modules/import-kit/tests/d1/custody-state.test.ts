import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture, nativePrivateTables } from './native-staging-fixture.ts';
import { initializeD1ImportStorage, resumeD1ImportStream, undoD1ImportStream, eraseD1ImportTarget, planD1Import, createD1ImportJob, resumeD1Import, readD1PersistedImport, retireD1ImportCustody } from '../../src/d1/index.ts';
import { runtime, source as d1Source, mapping as d1Mapping, targets as d1Targets } from './fixtures.ts';

test('additive custody revision migration preserves prior public bytes and cold erasure and undo',async t=>{
  const r=await nativeStagingFixture(t),before=r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all();
  const triggers=r.native().prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all() as {name:string;sql:string}[];
  for(const trigger of triggers)if(trigger.sql.includes('ik_d1_custody_states'))r.native().exec(`DROP TRIGGER ${trigger.name}`);
  r.native().exec('DROP TABLE ik_d1_custody_states');
  r.reopen();await initializeD1ImportStorage(r.db());
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all(),before);
  const counters=r.native().prepare('SELECT * FROM ik_d1_custody_states ORDER BY job_id').all();
  assert.equal(counters.length,before.length);
  assert.ok(counters.every(row=>row.revision===0));
  await initializeD1ImportStorage(r.db());
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_custody_states ORDER BY job_id').all(),counters);
  assert.equal((await resumeD1ImportStream(r.job.id,r.context())).state,'completed');
  assert.ok(r.native().prepare('SELECT * FROM ik_d1_custody_states').all().some(row=>Number(row.revision)>0));
  r.reopen();await eraseD1ImportTarget('record','0',r.targets.remove('workspace','record','0'),r.context());
  assert.equal((await undoD1ImportStream(r.job.id,r.context())).state,'undone');
  assert.equal((await undoD1ImportStream(r.job.id,r.context())).state,'undone');
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
});

test('custody revisions cover parent, membership and body writes and cannot rewind or disappear',async t=>{
  const r=await nativeStagingFixture(t),id=r.native().prepare('SELECT id FROM ik_jobs LIMIT 1').get()!.id;
  const revision=()=>Number(r.native().prepare('SELECT revision FROM ik_d1_custody_states WHERE job_id=?').get(id)!.revision);
  for(const statement of [
    'UPDATE ik_jobs SET checkpoint=checkpoint WHERE id=?',
    'UPDATE ik_originals SET name=name WHERE job_id=?',
    'UPDATE ik_d1_stream_pages SET total=total WHERE job_id=?',
    'UPDATE ik_d1_streams SET total=total WHERE id=(SELECT stream_id FROM ik_d1_stream_pages WHERE job_id=?)',
  ]){const before=revision();r.native().prepare(statement).run(id);assert.ok(revision()>before,statement);}
  const before=revision();
  assert.throws(()=>r.native().prepare('UPDATE ik_d1_custody_states SET revision=? WHERE job_id=?').run(before,id),/IMPORT_CUSTODY_STATE_CHANGED/);
  assert.throws(()=>r.native().prepare('UPDATE ik_d1_custody_states SET revision=? WHERE job_id=?').run(before-1,id),/IMPORT_CUSTODY_STATE_CHANGED/);
  assert.throws(()=>r.native().prepare('DELETE FROM ik_d1_custody_states WHERE job_id=?').run(id),/IMPORT_CUSTODY_STATE_CHANGED/);
  assert.equal(revision(),before);
});

const FINAL_READ='SELECT COUNT(*) FROM ik_provenance WHERE reversed=0 AND (destination=?';
/** Real D1 that runs `between` after readD1PersistedImport captured custody, just before its final atomic read. */
function interposed(db:any,between:()=>Promise<unknown>){
  const statements=new WeakMap<object,{statement:any;sql:string}>(),state={fired:false};
  const wrap=(statement:any,sql:string):any=>{const w={bind:(...p:unknown[])=>wrap(statement.bind(...p),sql),first:(...a:unknown[])=>statement.first(...a),all:(...a:unknown[])=>statement.all(...a),run:(...a:unknown[])=>statement.run(...a),raw:(...a:unknown[])=>statement.raw(...a)};statements.set(w,{statement,sql});return w;};
  return {state,database:{prepare:(sql:string)=>wrap(db.prepare(sql),sql),exec:(q:string)=>db.exec(q),async batch(list:any[]){
    const parts=list.map(s=>statements.get(s)!);
    if(!state.fired&&parts.some(p=>p.sql.includes(FINAL_READ))){state.fired=true;await between();}
    return db.batch(parts.map(p=>p.statement));
  }}};
}
const replace=(db:any,table:string,row:Record<string,unknown>)=>db.prepare(`INSERT OR REPLACE INTO ${table}(${Object.keys(row)}) VALUES(${Object.keys(row).map(()=>'?')})`).bind(...Object.values(row)).run();
const custodyRevision=async(db:any,job:string)=>(await db.prepare('SELECT revision FROM ik_d1_custody_states WHERE job_id=?').bind(job).first())?.revision as number|undefined;
/** Job A imports three contacts, B replaces contact 0 (A keeps a history row), C is reviewed and queued. */
async function chain(r:Awaited<ReturnType<typeof runtime>>){
  await r.reset();const ctx=r.context();
  const planA=await planD1Import(d1Source(3),d1Mapping,ctx),A=(await createD1ImportJob(planA,{...ctx,reviewedFingerprint:planA.fingerprint})).id as string;
  await resumeD1Import(A,ctx);
  const original=await d1Targets.read(r.db(),ctx.destination,'contact','0');
  const next=d1Source(1);next.records[0].sourceId='next-0';
  const planB=await planD1Import(next,{version:'v1',map:()=>({effects:[{targetKind:'contact',targetId:'0',expectedRevision:original!.revision,value:{email:'person0@example.test',evidence:'cleaned'}}]})},ctx);
  const B=(await createD1ImportJob(planB,{...ctx,reviewedFingerprint:planB.fingerprint})).id as string;
  await resumeD1Import(B,ctx);
  const queued=d1Source(1);queued.records[0].sourceId='queued-0';
  const planC=await planD1Import(queued,{version:'v1',map:()=>({effects:[{targetKind:'contact',targetId:'queued',value:{email:'queued@example.test',evidence:'queued'}}]})},ctx);
  const C=(await createD1ImportJob(planC,{...ctx,reviewedFingerprint:planC.fingerprint})).id as string;
  return {r,ctx,A,B,C};
}
async function readWith(s:Awaited<ReturnType<typeof chain>>,between:()=>Promise<unknown>){
  const probe=interposed(s.r.db(),between);
  const outcome=await readD1PersistedImport({...s.ctx,storage:{...s.ctx.storage,database:probe.database}}).then(()=>'ok',(error:Error)=>error.message);
  assert.equal(probe.state.fired,true,'the change lands between the custody capture and the final read');
  return outcome;
}

test('real D1: an insert over a custody revision or a reused job id cannot rewind or keep a revision',async t=>{
  const {r,ctx,A}=await chain(await runtime(t)),db=r.db(),before=await custodyRevision(db,A),revisions:Record<string,unknown>={};
  for(const statement of [
    'INSERT OR REPLACE INTO ik_d1_custody_states(job_id,revision) VALUES(?,0)',
    'REPLACE INTO ik_d1_custody_states(job_id,revision) VALUES(?,0)',
    'INSERT INTO ik_d1_custody_states(job_id,revision) VALUES(?,0)',
    'INSERT INTO ik_d1_custody_states(job_id,revision) VALUES(?,0) ON CONFLICT(job_id) DO UPDATE SET revision=0',
  ]){await db.prepare(statement).bind(A).run().catch(()=>{});revisions[statement]=await custodyRevision(db,A);}
  assert.deepEqual(revisions,Object.fromEntries(Object.keys(revisions).map(statement=>[statement,before])));
  // The additive backfill still adds a missing counter and keeps every existing one.
  const deletion=(await db.prepare("SELECT sql FROM sqlite_master WHERE name='ik_d1_custody_state_delete'").first()).sql;
  await db.batch(['DROP TRIGGER ik_d1_custody_state_delete',`DELETE FROM ik_d1_custody_states WHERE job_id='${A}'`,deletion].map((q:string)=>db.prepare(q)));
  const kept=(await db.prepare('SELECT * FROM ik_d1_custody_states ORDER BY job_id').all()).results;
  await initializeD1ImportStorage(db);
  assert.equal(await custodyRevision(db,A),0);
  assert.deepEqual((await db.prepare('SELECT * FROM ik_d1_custody_states WHERE job_id<>? ORDER BY job_id').bind(A).all()).results,kept);
  const job=await db.prepare('SELECT * FROM ik_jobs WHERE id=?').bind(A).first();
  await assert.rejects(replace(db,'ik_jobs',job),/IMPORT_JOB_ID_REUSED/);
  await assert.rejects(db.prepare(`INSERT INTO ik_jobs SELECT * FROM ik_jobs WHERE id=?`).bind(A).run(),/IMPORT_JOB_ID_REUSED/);
  assert.equal(await custodyRevision(db,A),0);
  // A retired job id never returns, with or without its old rows.
  const operation=job.operation_key as string;
  await retireD1ImportCustody({values:[operation]},[],ctx,[{sql:'UPDATE sessions SET enabled=enabled'}]);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM ik_d1_retirements WHERE id=? AND kind='job'").bind(A).first()).n,1);
  assert.equal(await db.prepare('SELECT 1 FROM ik_jobs WHERE id=?').bind(A).first(),null);
  await assert.rejects(replace(db,'ik_jobs',job),/IMPORT_JOB_ID_REUSED/);
  await assert.rejects(db.prepare(`INSERT INTO ik_jobs(${Object.keys(job)}) VALUES(${Object.keys(job).map(()=>'?')})`).bind(...Object.values(job)).run(),/IMPORT_JOB_ID_REUSED/);
});

test('real D1: a REPLACE between the persisted read\'s custody capture and its final read fails closed',async t=>{
  const firstRow=async(db:any,table:string,job:string)=>db.prepare(`SELECT * FROM ${table} WHERE job_id=? ${table==='ik_provenance'?'AND reversed=0':''} ORDER BY rowid LIMIT 1`).bind(job).first();
  type Scene=Awaited<ReturnType<typeof chain>>;
  // B is the only page of an open stream; the read uses B's custody, so its stream is part of it.
  const stream=async(s:Scene)=>{const db=s.r.db();await db.batch(["INSERT INTO ik_d1_streams(id,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,total,layout_hash,state) VALUES('stream','workspace','archive','v1','owner','f','stream-op',1,'l','open')",`INSERT INTO ik_d1_stream_pages(stream_id,ordinal,job_id,total) VALUES('stream',0,'${s.B}',1)`].map((q:string)=>db.prepare(q)));};
  // UPDATE OR REPLACE deletes the row its new key collides with the same way: a row of the queued
  // job, which the read never fences, is inserted under its own key and then updated onto a fenced one.
  const updateOnto=async(s:Scene,table:string,row:Record<string,unknown>,update:string,...params:unknown[])=>{
    const db=s.r.db(),queued={...row,job_id:s.C};
    await db.prepare(`INSERT INTO ${table}(${Object.keys(queued)}) VALUES(${Object.keys(queued).map(()=>'?')})`).bind(...Object.values(queued)).run();
    return db.prepare(`UPDATE OR REPLACE ${table} SET ${update}`).bind(...params).run();
  };
  const liveClaim=async(s:Scene)=>s.r.db().prepare('SELECT * FROM ik_sources WHERE identity=?').bind((await firstRow(s.r.db(),'ik_provenance',s.A)).source_identity).first();
  // SQLite's rowid is one more unique key of every custody table: naming an existing rowid replaces that row.
  const rowidOf=async(s:Scene,table:string,where:string,...params:unknown[])=>(await s.r.db().prepare(`SELECT rowid AS r FROM ${table} WHERE ${where} ORDER BY rowid LIMIT 1`).bind(...params).first()).r as number;
  const replaceRowid=async(s:Scene,table:string,where:string,param:unknown,row:Record<string,unknown>)=>replace(s.r.db(),table,{rowid:await rowidOf(s,table,where,param),...row});
  const queuedRows:Record<string,(s:Scene,row:any)=>Record<string,unknown>>={
    ik_d1_plan_index:s=>({job_id:s.C,ordinal:900,source_identity:'queued-source',target_identity:'queued-target'}),
    ik_d1_entries:s=>({job_id:s.C,ordinal:900,source_identity:'queued-source',owner_job_id:s.C,effects_hash:'queued'}),
    ik_batches:s=>({job_id:s.C,action:'apply',position:900,end_position:901,fence:0}),
    ik_originals:s=>({job_id:s.C,kind:'artifact',original_key:'queued-original',name:'queued',sha256:'queued',size:0}),
    ik_d1_original_chunks:s=>({job_id:s.C,kind:'artifact',original_key:'queued-original',ordinal:900,bytes:new Uint8Array([1])}),
    ik_original_sets:(s,row)=>({job_id:s.C,version:row.version}),
    ik_d1_indexed_jobs:(s,row)=>({job_id:s.C,fingerprint:row.fingerprint}),
  };
  // A's first plan index row's source and target are erased (tombstones the read's job owns through its plan index).
  const tombstones=async(s:Scene)=>{const db=s.r.db(),index=await firstRow(db,'ik_d1_plan_index',s.A);await db.batch([db.prepare('INSERT INTO ik_d1_erased_sources(destination,identity) VALUES(?,?)').bind(s.ctx.destination,index.source_identity),db.prepare('INSERT INTO ik_d1_erased_targets(destination,identity) VALUES(?,?)').bind(s.ctx.destination,index.target_identity)]);return index;};
  const cases:Record<string,(s:Scene)=>Promise<unknown>>={
    'a live claim moved to the queued job':async s=>replace(s.r.db(),'ik_sources',{...await firstRow(s.r.db(),'ik_sources',s.A),job_id:s.C}),
    'a live provenance row moved to the queued job':async s=>replace(s.r.db(),'ik_provenance',{...await firstRow(s.r.db(),'ik_provenance',s.A),job_id:s.C}),
    'a live provenance target taken over under a new id':async s=>{const row=await firstRow(s.r.db(),'ik_provenance',s.A);return replace(s.r.db(),'ik_provenance',{...row,id:'taken-'+row.id,job_id:s.C});},
    'a history row moved to the queued job':async s=>replace(s.r.db(),'ik_d1_history',{...await firstRow(s.r.db(),'ik_d1_history',s.A),job_id:s.C}),
    'a history successor taken over under a new id':async s=>{const row=await firstRow(s.r.db(),'ik_d1_history',s.A);return replace(s.r.db(),'ik_d1_history',{...row,id:'taken-'+row.id,job_id:s.C});},
    'a stream replaced in place':async s=>replace(s.r.db(),'ik_d1_streams',{...await s.r.db().prepare("SELECT * FROM ik_d1_streams WHERE id='stream'").first(),state:'replaced'}),
    'a stream page taken over by another job':async s=>replace(s.r.db(),'ik_d1_stream_pages',{stream_id:'stream',ordinal:0,job_id:s.C,total:1,erased_records:0}),
    'a custody write, then its revision replaced back':async s=>{
      const db=s.r.db(),captured=await custodyRevision(db,s.A);
      await db.prepare("UPDATE ik_provenance SET record_json=json_set(record_json,'$.tampered',1) WHERE id=?").bind((await firstRow(db,'ik_provenance',s.A)).id).run();
      await db.prepare('INSERT OR REPLACE INTO ik_d1_custody_states(job_id,revision) VALUES(?,?)').bind(s.A,captured).run();
    },
    'a claim taken over by an update':async s=>{const claim=await firstRow(s.r.db(),'ik_sources',s.A);return updateOnto(s,'ik_sources',{...claim,identity:'queued-claim'},"identity=? WHERE identity='queued-claim'",claim.identity);},
    'the live claim taken over by an update':async s=>{const claim=await liveClaim(s);return updateOnto(s,'ik_sources',{...claim,identity:'queued-claim'},"identity=? WHERE identity='queued-claim'",claim.identity);},
    'a live provenance row taken over by an update':async s=>{const row=await firstRow(s.r.db(),'ik_provenance',s.A);return updateOnto(s,'ik_provenance',{...row,id:'queued-row',ordinal:900,target_id:'queued-target',reversed:1},"id=?,reversed=0 WHERE id='queued-row'",row.id);},
    'a live provenance target taken over by an update':async s=>{const row=await firstRow(s.r.db(),'ik_provenance',s.A);return updateOnto(s,'ik_provenance',{...row,id:'queued-row',ordinal:900,reversed:1},"reversed=0 WHERE id='queued-row'");},
    'a history row taken over by an update':async s=>{const row=await firstRow(s.r.db(),'ik_d1_history',s.A);return updateOnto(s,'ik_d1_history',{...row,id:'queued-history',ordinal:900,successor_id:'queued-successor'},"id=? WHERE id='queued-history'",row.id);},
    'a history successor taken over by an update':async s=>{const row=await firstRow(s.r.db(),'ik_d1_history',s.A);return updateOnto(s,'ik_d1_history',{...row,id:'queued-history',ordinal:900,successor_id:'queued-successor'},"successor_id=? WHERE id='queued-history'",row.successor_id);},
    'a stream page taken over by an update':async s=>{
      await s.r.db().prepare("INSERT INTO ik_d1_streams(id,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,total,layout_hash,state) VALUES('queued-stream','workspace','archive','v1','owner','f','queued-op',1,'l','open')").run();
      return updateOnto(s,'ik_d1_stream_pages',{stream_id:'queued-stream',ordinal:0,total:1},"stream_id='stream' WHERE stream_id='queued-stream'");
    },
    'the live claim replaced by rowid':async s=>{const claim=await liveClaim(s);return replaceRowid(s,'ik_sources','identity=?',claim.identity,{...claim,identity:'queued-claim',job_id:s.C});},
    'the live claim taken over by a rowid update':async s=>{const claim=await liveClaim(s);return updateOnto(s,'ik_sources',{...claim,identity:'queued-claim'},"rowid=? WHERE identity='queued-claim'",await rowidOf(s,'ik_sources','identity=?',claim.identity));},
    'a live provenance row replaced by rowid':async s=>{const row=await firstRow(s.r.db(),'ik_provenance',s.A);return replaceRowid(s,'ik_provenance','id=?',row.id,{...row,id:'queued-row',ordinal:900,target_id:'queued-target',job_id:s.C});},
    'a live provenance row taken over by a rowid update':async s=>{const row=await firstRow(s.r.db(),'ik_provenance',s.A);return updateOnto(s,'ik_provenance',{...row,id:'queued-row',ordinal:900,target_id:'queued-target',reversed:1},"rowid=?,reversed=0 WHERE id='queued-row'",await rowidOf(s,'ik_provenance','id=?',row.id));},
    'a history row replaced by rowid':async s=>{const row=await firstRow(s.r.db(),'ik_d1_history',s.A);return replaceRowid(s,'ik_d1_history','id=?',row.id,{...row,id:'queued-history',ordinal:900,successor_id:'queued-successor',job_id:s.C});},
    'a history row taken over by a rowid update':async s=>{const row=await firstRow(s.r.db(),'ik_d1_history',s.A);return updateOnto(s,'ik_d1_history',{...row,id:'queued-history',ordinal:900,successor_id:'queued-successor'},"rowid=? WHERE id='queued-history'",await rowidOf(s,'ik_d1_history','id=?',row.id));},
    'a stream page replaced by rowid':async s=>replaceRowid(s,'ik_d1_stream_pages','job_id=?',s.B,{stream_id:'stream',ordinal:7,job_id:s.C,total:1}),
    'a stream page taken over by a rowid update':async s=>{
      await s.r.db().prepare("INSERT INTO ik_d1_streams(id,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,total,layout_hash,state) VALUES('queued-stream','workspace','archive','v1','owner','f','queued-op',1,'l','open')").run();
      return updateOnto(s,'ik_d1_stream_pages',{stream_id:'queued-stream',ordinal:0,total:1},"rowid=? WHERE stream_id='queued-stream'",await rowidOf(s,'ik_d1_stream_pages','job_id=?',s.B));
    },
    ...Object.fromEntries(Object.entries(queuedRows).map(([table,row])=>[`an ${table} row replaced by rowid`,async(s:Scene)=>replaceRowid(s,table,'job_id=?',s.A,row(s,await firstRow(s.r.db(),table,s.A)))])),
    'a source tombstone replaced by rowid':async s=>replaceRowid(s,'ik_d1_erased_sources','identity=?',(await firstRow(s.r.db(),'ik_d1_plan_index',s.A)).source_identity,{destination:s.ctx.destination,identity:'queued-erased'}),
    'a target tombstone taken over by a rowid update':async s=>{
      const db=s.r.db(),victim=await rowidOf(s,'ik_d1_erased_targets','identity=?',(await firstRow(db,'ik_d1_plan_index',s.A)).target_identity);
      await db.prepare("INSERT INTO ik_d1_erased_targets(destination,identity) VALUES(?,'queued-erased')").bind(s.ctx.destination).run();
      return db.prepare("UPDATE OR REPLACE ik_d1_erased_targets SET rowid=? WHERE identity='queued-erased'").bind(victim).run();
    },
    'a custody write, then its counter replaced through another counter\'s rowid':async s=>{
      const db=s.r.db(),captured=await custodyRevision(db,s.A);
      await db.prepare("UPDATE ik_provenance SET record_json=json_set(record_json,'$.tampered',1) WHERE id=?").bind((await firstRow(db,'ik_provenance',s.A)).id).run();
      await assert.rejects(db.prepare('UPDATE OR REPLACE ik_d1_custody_states SET rowid=?,revision=revision+1 WHERE job_id=?').bind(await rowidOf(s,'ik_d1_custody_states','job_id=?',s.A),s.C).run(),/IMPORT_CUSTODY_STATE_CHANGED/);
      await db.prepare('INSERT INTO ik_d1_custody_states(job_id,revision) VALUES(?,?)').bind(s.A,captured).run();
    },
  };
  const r=await runtime(t),outcomes:Record<string,string>={};
  for(const [name,change] of Object.entries(cases)){
    const s=await chain(r);
    if(name.startsWith('a stream'))await stream(s);
    if(name.includes('tombstone'))await tombstones(s);
    assert.ok((await readD1PersistedImport(s.ctx)).provenance.length>0,name);
    outcomes[name]=await readWith(s,()=>change(s));
  }
  assert.deepEqual(outcomes,Object.fromEntries(Object.keys(cases).map(name=>[name,'IMPORT_ATOMIC_GUARD'])));
});
