import test from 'node:test';
import { boundedRuntime } from './retained-fixtures.ts';
import assert from 'node:assert/strict';
import { sqliteSource,sqliteMapping } from './sqlite-runtime.ts';
import { planD1ImportStream,createD1ImportStream,readD1ImportJob,resumeD1ImportStream,undoD1ImportStream,eraseD1ImportTarget } from '../../src/d1/index.ts';

for(const applied of [false,true])test(`bounded erasure reconciles eighty-four ${applied?'reused completed':'queued'} stream copies within one request`,async t=>{
  const r=await boundedRuntime(t),context=()=>({...r.context(),maxBatchBytes:2*1024*1024}),source=sqliteSource(1);
  source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const plan=await planD1ImportStream(source,sqliteMapping,context()),streams:string[]=[];
  for(let i=0;i<84;i++){
    const job=await createD1ImportStream(plan,{...context(),operationKey:`retained-copy-${i}`,reviewedFingerprint:plan.fingerprint});streams.push(job.id);
    if(applied)assert.equal((await resumeD1ImportStream(job.id,context())).state,'completed');
  }
  const children=r.native().prepare('SELECT id FROM ik_jobs ORDER BY id').all();assert.equal(children.length,84);
  const input=context();let queries=0;const wire:number[]=[];
  const wrap=(statement:any):any=>({query:statement.query,values:statement.values,bind(...values:any[]){return wrap(statement.bind(...values));},async first(){queries++;return statement.first();},async all(){queries++;return statement.all();}});
  const database={prepare:(sql:string)=>wrap(input.storage.database.prepare(sql)),async batch(statements:any[]){queries+=statements.length;wire.push(Buffer.byteLength(JSON.stringify(statements.map(s=>({sql:s.query,params:s.values})))));return input.storage.database.batch(statements);}};
  const result=await eraseD1ImportTarget('record','0',input.storage.targets.remove('workspace','record','0'),{...input,storage:{...input.storage,database}});
  assert.equal(result.erasedRecords,84);assert.ok(queries<=1000);assert.ok(wire.every(bytes=>bytes<=2*1024*1024));
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  for(const table of ['ik_d1_native_staging','ik_d1_native_staging_index','ik_d1_native_staging_values','ik_d1_staging','bounded_native_fences'])assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
  r.reopen();
  for(const child of children)assert.equal((await readD1ImportJob(child.id as string,context())).erasedRecords,1);
  for(const id of streams){assert.equal((await resumeD1ImportStream(id,context())).state,'completed');assert.equal((await undoD1ImportStream(id,context())).state,'undone');assert.equal((await undoD1ImportStream(id,context())).state,'undone');}
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  await assert.rejects(createD1ImportStream(plan,{...context(),operationKey:'after-privacy',reviewedFingerprint:plan.fingerprint}),/IMPORT_SOURCE_ERASED/);
  t.diagnostic(JSON.stringify({copies:84,applied,queries,maxBatchBytes:Math.max(...wire)}));
});

test('bounded erasure fences custody changes between numeric measurement and payload reads',async t=>{
  const r=await boundedRuntime(t),source=sqliteSource(1);source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const plan=await planD1ImportStream(source,sqliteMapping,r.context()),stream=await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
  await resumeD1ImportStream(stream.id,r.context());
  const originalJob=r.native().prepare('SELECT id,fence FROM ik_jobs').get()!,child=originalJob.id as string,native=r.native().prepare('SELECT * FROM native_records').all();
  let changed=false,payloadRows=0;
  const input=r.context(),wrap=(statement:any):any=>({query:statement.query,values:statement.values,bind(...values:any[]){return wrap(statement.bind(...values));},first:()=>statement.first(),async all(){
    const result=await statement.all();
    if(!changed&&statement.query.includes(' AS bytes,')&&statement.query.includes(' AS dependencies')){changed=true;r.native().prepare('UPDATE ik_jobs SET fence=fence+1 WHERE id=?').run(child);}
    else if(changed&&statement.query.startsWith('SELECT j.*,r.revision AS custody_revision'))payloadRows+=result.results.length;
    return result;
  }});
  const database={prepare:(query:string)=>wrap(input.storage.database.prepare(query)),batch:input.storage.database.batch.bind(input.storage.database)};
  await assert.rejects(eraseD1ImportTarget('record','0',input.storage.targets.remove('workspace','record','0'),{...input,storage:{...input.storage,database}}),/IMPORT_JOB_NOT_FOUND|IMPORT_CUSTODY_STATE_CHANGED/);
  assert.equal(changed,true);assert.equal(payloadRows,0);
  assert.deepEqual(r.native().prepare('SELECT * FROM native_records').all(),native);
  assert.equal(r.native().prepare('SELECT fence FROM ik_jobs WHERE id=?').get(child)!.fence,Number(originalJob.fence)+1);
  for(const table of ['ik_d1_erased_sources','ik_d1_erased_targets','ik_d1_native_staging','ik_d1_native_staging_index','ik_d1_native_staging_values','bounded_native_fences'])assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
  assert.equal((await readD1ImportJob(child,r.context())).erasedRecords,0);
});

test('bulk erasure rejects unexpected strict reversal rows before private preparation',async t=>{
  const r=await boundedRuntime(t),source=sqliteSource(1);source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const plan=await planD1ImportStream(source,sqliteMapping,r.context());await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
  const child=r.native().prepare('SELECT id FROM ik_jobs').get()!.id as string;
  r.native().prepare("INSERT INTO ik_d1_reversal_reports(job_id,effect_id,position,record_json) VALUES(?,'unexpected',0,'{}')").run(child);
  const before=r.native().prepare('SELECT * FROM ik_jobs').all(),input=r.context();
  await assert.rejects(eraseD1ImportTarget('record','0',input.storage.targets.remove('workspace','record','0'),input),/IMPORT_REVERSAL_INTEGRITY/);
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs').all(),before);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_reversal_reports').get()!.n,1);
  for(const table of ['ik_d1_erased_sources','ik_d1_erased_targets','ik_d1_native_staging','ik_d1_native_staging_index','ik_d1_native_staging_values','bounded_native_fences'])assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
});
