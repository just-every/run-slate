import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture } from './retained-fixtures.ts';
import { nativePrivateTables } from './native-staging-fixture.ts';
import { sqliteMapping } from './sqlite-runtime.ts';
import { canonicalJson,sha256,planD1ImportStream,createD1ImportStream,resumeD1ImportStream,eraseD1ImportTarget,readD1ImportJob } from '../../src/d1/index.ts';

async function mixedCustody(t:any){
  const r=await nativeStagingFixture(t),source=structuredClone(r.source);let seed=1;
  const rows=Array.from({length:20},()=>Array.from({length:25000},()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return String.fromCharCode(0x4e00+(seed>>>0)%20000);}).join(''));
  assert.ok(Buffer.byteLength(canonicalJson({rows}))<2000000,'each complete native value is legal before aggregate staging');
  source.records=['erased-target','next-target','retained-target'].map(sourceId=>({...source.records[0],sourceId,payload:{rows:[...rows]}}));source.records.forEach(record=>record.payloadHash=sha256(canonicalJson(record.payload)));
  const plan=await planD1ImportStream(source,sqliteMapping,r.context());assert.ok(plan.lengths.includes(3));
  let stream=await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});while(stream.state!=='completed')stream=await resumeD1ImportStream(stream.id,r.context());
  await eraseD1ImportTarget('record','erased-target',r.targets.remove('workspace','record','erased-target'),r.context());r.reopen();
  const index=r.native().prepare('SELECT i.* FROM ik_d1_plan_index i JOIN ik_d1_stream_pages p ON p.job_id=i.job_id WHERE p.stream_id=? AND i.ordinal=0').get(stream.id)!;
  assert.ok(index);assert.equal((await readD1ImportJob(index.job_id as string,r.context())).erasedRecords,1);
  return {...r,index};
}
function meter(input:any){
  const evidence={queries:0,privateBatches:0,publicationAttempts:0,wire:[] as number[]};
  const wrap=(statement:any):any=>({query:statement.query,values:statement.values,bind(...values:any[]){return wrap(statement.bind(...values));},async first(){evidence.queries++;return statement.first();},async all(){evidence.queries++;return statement.all();}});
  const database={prepare:(query:string)=>wrap(input.storage.database.prepare(query)),async batch(statements:any[]){evidence.queries+=statements.length;evidence.privateBatches+=Number(statements.some(s=>s.query.startsWith('INSERT INTO ik_d1_native_staging_values')));evidence.publicationAttempts+=Number(statements.some(s=>s.query.startsWith('UPDATE ik_d1_custody_revisions SET seal=')));evidence.wire.push(Buffer.byteLength(JSON.stringify(statements.map(s=>({sql:s.query,params:s.values})))));return input.storage.database.batch(statements);}};
  return {evidence,context:{...input,storage:{...input.storage,database}}};
}
const publicTables=['ik_jobs','ik_d1_plan_chunks','ik_d1_plan_index','ik_d1_indexed_jobs','ik_d1_erased_sources','ik_d1_erased_targets','ik_provenance','ik_d1_history','ik_sources','ik_d1_entries','ik_batches','ik_d1_streams','ik_d1_stream_pages','ik_d1_custody_revisions','ik_d1_custody_states','native_records','native_parts','native_clock'];
function publicDigest(r:any){return Object.fromEntries(publicTables.map(table=>{const rows=r.native().prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();return [table,sha256(canonicalJson(rows))];}));}

for(const action of ['cold read','another erasure'])for(const kind of ['source','target'])test(`bounded ${action} rejects late removal of an earlier erased ${kind} tombstone`,async t=>{
  const r=await mixedCustody(t),table=kind==='source'?'ik_d1_erased_sources':'ik_d1_erased_targets',identity=kind==='source'?r.index.source_identity:r.index.target_identity;
  const before=publicDigest(r),measured=meter(r.context());
  const lateDeletes:number[]=[];
  assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table} WHERE destination='workspace' AND identity=?`).get(identity)!.n,1);
  if (action === 'cold read') {
    let guardBatches = 0, injected = false;
    const input = measured.context, database = { ...input.storage.database, async batch(statements:any[]) {
      if (statements.some(statement => statement.query.startsWith('SELECT CASE'))) {
        guardBatches++;
        if (guardBatches === 2) {
          r.native().prepare(`DELETE FROM ${table} WHERE destination='workspace' AND identity=?`).run(identity);
          injected = true;
        }
      }
      assert.ok(statements.every(statement => statement.query.startsWith('SELECT ')));
      return input.storage.database.batch(statements);
    } };
    await assert.rejects(readD1ImportJob(r.index.job_id as string, { ...input, storage: { ...input.storage, database } }), /IMPORT_ATOMIC_GUARD/);
    assert.ok(injected, 'the mutation occurred after authorization and custody reads');
    assert.equal(measured.evidence.privateBatches, 0); assert.equal(measured.evidence.publicationAttempts, 0);
    assert.ok(measured.evidence.queries <= 1000); assert.ok(measured.evidence.wire.every(bytes => bytes <= 2*1024*1024));
    const after = publicDigest(r);
    for (const name of publicTables.filter(name => name !== table && name !== 'ik_d1_custody_revisions' && name !== 'ik_d1_custody_states')) assert.equal(after[name], before[name], name);
    for (const name of nativePrivateTables) assert.equal(r.native().prepare(`SELECT count(*) n FROM ${name}`).get()!.n, 0, name);
    r.native().prepare(`INSERT INTO ${table}(destination,identity) VALUES('workspace',?)`).run(identity);
    r.reopen();
    const recovered = meter(r.context());
    r.native().exec('PRAGMA query_only=ON');
    assert.equal((await readD1ImportJob(r.index.job_id as string, recovered.context)).erasedRecords, 1);
    r.native().exec('PRAGMA query_only=OFF');
    assert.equal(recovered.evidence.privateBatches, 0); assert.equal(recovered.evidence.publicationAttempts, 0);
    assert.ok(recovered.evidence.queries <= 1000); assert.ok(recovered.evidence.wire.every(bytes => bytes <= 2*1024*1024));
    return;
  }
  // The callback records the actual cleanup interval even when SQLite rolls
  // back the faulted transaction. It cannot make any application guard pass.
  r.native().function('observe_erased_tombstone',remaining=>{lateDeletes.push(Number(remaining));return 1;});
  // This condition is false throughout begin, registration and payload writes.
  // It becomes true only in final publication after exact checks and sealing.
  r.native().exec(`CREATE TRIGGER erase_after_seal AFTER DELETE ON ik_d1_assertions WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences f JOIN ik_d1_custody_revisions r ON r.job_id=f.job_id WHERE r.seal=f.stream_id) BEGIN SELECT observe_erased_tombstone((SELECT count(*) FROM ${table} WHERE destination='workspace' AND identity='${identity}')); DELETE FROM ${table} WHERE destination='workspace' AND identity='${identity}'; SELECT observe_erased_tombstone((SELECT count(*) FROM ${table} WHERE destination='workspace' AND identity='${identity}')); END`);
  const invoke=(context:any)=>action==='cold read'?readD1ImportJob(r.index.job_id as string,context):eraseD1ImportTarget('record','next-target',r.targets.remove('workspace','record','next-target'),context);
  await assert.rejects(invoke(measured.context),/IMPORT_PUBLICATION_CHANGED/);
  assert.ok(measured.evidence.privateBatches>0);assert.equal(measured.evidence.publicationAttempts,1);
  assert.ok(lateDeletes.length>0,'the sealed assertion cleanup attempted to remove the tombstone');assert.ok(lateDeletes.every(count=>count===1),'the publication fence refused removal before it could change custody');
  assert.ok(measured.evidence.queries<=1000);assert.ok(measured.evidence.wire.every(bytes=>bytes<=2*1024*1024));
  assert.deepEqual(publicDigest(r),before);
  for(const name of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${name}`).get()!.n,0,name);
  r.native().exec('DROP TRIGGER erase_after_seal');
  const recovered=meter(r.context());await invoke(recovered.context);
  assert.ok(recovered.evidence.privateBatches>0);assert.ok(recovered.evidence.queries<=1000);assert.ok(recovered.evidence.wire.every(bytes=>bytes<=2*1024*1024));
  assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table} WHERE destination='workspace' AND identity=?`).get(identity)!.n,1);
  r.reopen();assert.equal((await readD1ImportJob(r.index.job_id as string,r.context())).erasedRecords,2);
  for(const name of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${name}`).get()!.n,0,name);
  t.diagnostic(JSON.stringify({action,kind,failedRequest:measured.evidence,recoveredRequest:recovered.evidence}));
});
