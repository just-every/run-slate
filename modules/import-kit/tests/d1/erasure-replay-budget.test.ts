import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture } from './retained-fixtures.ts';
import { nativePrivateTables } from './native-staging-fixture.ts';
import { canonicalJson,sha256,planD1ImportStream,createD1ImportStream,resumeD1ImportStream,eraseD1ImportTarget } from '../../src/d1/index.ts';

for(const afterRegistration of [false,true])test(`erasure reuses its measured closure when an import commits after ${afterRegistration?'registration':'begin'}`,async t=>{
  const r=await nativeStagingFixture(t),targets={...r.targets,write(row:any){return [...r.targets.remove(row.destination,row.targetKind,row.targetId),...r.targets.write(row)];}},owner=()=>({...r.context(),storage:{database:r.db(),targets}});
  let current:any;
  for(let i=0;i<8;i++){
    const source=structuredClone(r.source);source.records[0].sourceId=`history-${i}`;source.records[0].payload={rows:[`history ${i}`]};source.records[0].payloadHash=sha256(canonicalJson(source.records[0].payload));
    const plan=await planD1ImportStream(source,{version:'v1',map:record=>({effects:[{targetKind:'record',targetId:'history-target',...(current?{expectedRevision:current.revision}:{}),value:record.payload}]})},owner());
    const job=await createD1ImportStream(plan,{...owner(),reviewedFingerprint:plan.fingerprint});assert.equal((await resumeD1ImportStream(job.id,owner())).state,'completed');
    current=await targets.read(r.db(),'workspace','record','history-target');
  }
  let seed=1;
  const rows=Array.from({length:20},()=>Array.from({length:25000},()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return String.fromCharCode(0x4e00+(seed>>>0)%20000);}).join(''));
  const source=structuredClone(r.source);source.records=['erase-target','history-target','retained-target'].map(id=>({...source.records[0],sourceId:id,payload:{rows:id==='history-target'?['new history']:[...rows]}}));
  source.records.forEach(record=>record.payloadHash=sha256(canonicalJson(record.payload)));
  const plan=await planD1ImportStream(source,{version:'v1',map:record=>({effects:[{targetKind:'record',targetId:record.sourceId,...(record.sourceId==='history-target'?{expectedRevision:current.revision}:{}),value:record.payload}]})},owner());
  const job=await createD1ImportStream(plan,{...owner(),reviewedFingerprint:plan.fingerprint});
  const input={...owner(),authorization:{...owner().authorization,principalId:'privacy-owner'}};let queries=0,measurements=0,lateMeasurements=0,committed=false,registered=false;const wire:number[]=[];
  const wrap=(statement:any):any=>({query:statement.query,values:statement.values,bind(...values:any[]){return wrap(statement.bind(...values));},async first(){queries++;return statement.first();},async all(){queries++;if(statement.query.includes(' AS bytes,')&&statement.query.includes(' AS dependencies')){measurements++;if(committed)lateMeasurements++;}return statement.all();}});
  const database={prepare:(query:string)=>wrap(input.storage.database.prepare(query)),async batch(statements:any[]){
    queries+=statements.length;wire.push(Buffer.byteLength(JSON.stringify(statements.map(s=>({sql:s.query,params:s.values})))));
    const result=await input.storage.database.batch(statements);
    const registration=statements.some(s=>s.query.startsWith('UPDATE ik_d1_native_staging SET registered_revision'));
    registered ||= registration;
    if(!committed&&statements.some(s=>s.query.startsWith(afterRegistration?'UPDATE ik_d1_native_staging SET registered_revision':'INSERT INTO ik_d1_native_staging('))){
      committed=true;let next=await resumeD1ImportStream(job.id,owner());while(next.state!=='completed')next=await resumeD1ImportStream(job.id,owner());
    }
    return result;
  }};
  await assert.rejects(eraseD1ImportTarget('record','erase-target',targets.remove('workspace','record','erase-target'),{...input,storage:{...input.storage,database}}),/IMPORT_CUSTODY_STATE_CHANGED|IMPORT_JOB_NOT_FOUND/);
  assert.equal(committed,true);assert.equal(registered,afterRegistration);assert.equal(measurements,1);assert.equal(lateMeasurements,0);assert.ok(queries<=1000);assert.ok(wire.every(bytes=>bytes<=2*1024*1024));
  assert.equal((await resumeD1ImportStream(job.id,owner())).state,'completed');
  for(const record of source.records)assert.deepEqual((await targets.read(r.db(),'workspace','record',record.sourceId))!.value,record.payload);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_erased_targets').get()!.n,0);
  for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
  t.diagnostic(JSON.stringify({queries,measurements,lateMeasurements,maxBatchBytes:Math.max(...wire)}));
});
