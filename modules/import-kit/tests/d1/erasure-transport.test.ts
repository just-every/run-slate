import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture, nativePrivateTables } from './native-staging-fixture.ts';
import { sqliteMapping } from './sqlite-runtime.ts';
import { canonicalJson, sha256, planD1ImportStream, createD1ImportStream, resumeD1ImportStream, eraseD1ImportTarget, cancelD1ErasureStaging, readD1ImportJob } from '../../src/d1/index.ts';

async function fixture(t:any){
  const r=await nativeStagingFixture(t),source=structuredClone(r.source);
  let seed=1;
  const rows=Array.from({length:20},()=>Array.from({length:25000},()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return String.fromCharCode(0x4e00+(seed>>>0)%20000);}).join(''));
  source.records=Array.from({length:3},(_,i)=>({...source.records[0],sourceId:String(i),payload:{rows:[...rows]}}));
  source.records.forEach(record=>record.payloadHash=sha256(canonicalJson(record.payload)));
  const plan=await planD1ImportStream(source,sqliteMapping,r.context());
  assert.ok(plan.lengths.includes(3),'erasure replaces a shared page retaining both other large records');
  let job=await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
  while(job.state!=='completed')job=await resumeD1ImportStream(job.id,r.context());
  return {...r,source,plan,job};
}
for(const interrupted of [false,true])test(`bounded atomic erasure retains unrelated low-compression values with interruption ${interrupted}`,async t=>{
  const r=await fixture(t),bytes:number[]=[],input=r.context();let staged=0,stopped=false;
  const database={prepare:input.storage.database.prepare,async batch(statements:any[]){
    bytes.push(Buffer.byteLength(JSON.stringify(statements.map(statement=>({sql:statement.query,params:statement.values})))));
    if(statements.some(statement=>statement.query.startsWith('INSERT INTO ik_d1_native_staging_values'))&&++staged===2&&interrupted)stopped=true;
    if(stopped)throw new Error('runtime stopped during privacy staging');
    return input.storage.database.batch(statements);
  }};
  const erase=()=>eraseD1ImportTarget('record','0',r.targets.remove('workspace','record','0'),{...input,authorization:{...input.authorization,principalId:'privacy-owner'},storage:{...input.storage,database}});
  if(interrupted){
    const before=r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all();
    await assert.rejects(erase(),/runtime stopped/);
    assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all(),before);
    assert.ok(await r.targets.read(r.db(),'workspace','record','0'));
    assert.ok(r.native().prepare('SELECT count(*) n FROM ik_d1_native_staging_values').get()!.n);
    const stage=r.native().prepare("SELECT job_id FROM ik_d1_native_staging WHERE action='erase'").get()!;
    const retained=r.native().prepare('SELECT * FROM ik_d1_native_staging_values ORDER BY value_ordinal,ordinal').all();
    await cancelD1ErasureStaging(stage.job_id as string,r.context());
    assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_native_staging_values ORDER BY value_ordinal,ordinal').all(),retained);
    const privacy=()=>({...r.context(),authorization:{...r.context().authorization,principalId:'privacy-owner'}});
    r.native().exec("UPDATE native_authority SET enabled=0 WHERE id='owner'");
    await assert.rejects(cancelD1ErasureStaging(stage.job_id as string,privacy()),/IMPORT_ATOMIC_GUARD/);
    assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_native_staging_values ORDER BY value_ordinal,ordinal').all(),retained);
    r.native().exec("UPDATE native_authority SET enabled=1 WHERE id='owner'");
    await cancelD1ErasureStaging(stage.job_id as string,privacy());
    for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
    assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all(),before);
    assert.ok(await r.targets.read(r.db(),'workspace','record','0'));
    stopped=false;staged=0;
    await assert.rejects(erase(),/runtime stopped/);
    r.reopen();
    await eraseD1ImportTarget('record','0',r.targets.remove('workspace','record','0'),{...r.context(),authorization:{...r.context().authorization,principalId:'privacy-owner'}});
  }else await erase();
  assert.ok(staged>0);assert.ok(bytes.every(size=>size<=2*1024*1024));
  assert.equal(await r.targets.read(r.db(),'workspace','record','0'),undefined);
  assert.deepEqual((await r.targets.read(r.db(),'workspace','record','1'))!.value,r.source.records[1].payload);
  assert.deepEqual((await r.targets.read(r.db(),'workspace','record','2'))!.value,r.source.records[2].payload);
  for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
  r.reopen();await resumeD1ImportStream(r.job.id,r.context());
  assert.equal(await r.targets.read(r.db(),'workspace','record','0'),undefined);
});


test('bounded erasure visits multiple retained copies and reserves the complete query and wire budget',async t=>{
  const r=await fixture(t);
  for(let i=0;i<2;i++)await createD1ImportStream(r.plan,{...r.context(),operationKey:`retained-copy-${i}`,reviewedFingerprint:r.plan.fingerprint});
  const affected=r.native().prepare("SELECT DISTINCT job_id FROM ik_d1_plan_index WHERE target_identity IN (SELECT target_identity FROM ik_d1_plan_index WHERE ordinal=0)").all();
  assert.ok(affected.length>=4);
  const input=r.context();let queries=0,privateWrites=0;const bytes:number[]=[];
  const wrap=(statement:any):any=>({bind(...values:any[]){return wrap(statement.bind(...values));},async first(){queries++;return statement.first();},async all(){queries++;return statement.all();},query:statement.query,values:statement.values});
  const database={prepare:(sql:string)=>wrap(input.storage.database.prepare(sql)),async batch(statements:any[]){
    queries+=statements.length;bytes.push(Buffer.byteLength(JSON.stringify(statements.map(s=>({sql:s.query,params:s.values})))));
    privateWrites+=Number(statements.some(s=>s.query.startsWith('INSERT INTO ik_d1_native_staging_values')));
    return input.storage.database.batch(statements);
  }};
  const result=await eraseD1ImportTarget('record','0',r.targets.remove('workspace','record','0'),{...input,storage:{...input.storage,database}});
  assert.equal(result.erasedRecords,affected.length);assert.ok(privateWrites>1);assert.ok(queries<=1000);assert.ok(bytes.every(size=>size<=2*1024*1024));
  r.reopen();
  for(const row of affected)assert.equal((await readD1ImportJob(row.job_id as string,r.context())).erasedRecords,1);
  assert.deepEqual((await r.targets.read(r.db(),'workspace','record','1'))!.value,r.source.records[1].payload);
  assert.deepEqual((await r.targets.read(r.db(),'workspace','record','2'))!.value,r.source.records[2].payload);
  for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
});

for(const mutation of ['authority','body','revision'])test(`bounded erasure refuses changed ${mutation} during private preparation without native deletion`,async t=>{
  const r=await fixture(t),before=r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all();
  if(mutation==='authority')r.native().exec("CREATE TRIGGER erase_fault AFTER INSERT ON ik_d1_native_staging_values BEGIN UPDATE native_authority SET enabled=0;END");
  if(mutation==='body')r.native().exec("CREATE TRIGGER erase_fault AFTER INSERT ON ik_d1_native_staging_values BEGIN UPDATE ik_d1_native_staging_values SET body=replace(body,substr(body,1,1),'x') WHERE stage_id=NEW.stage_id AND value_ordinal=NEW.value_ordinal AND ordinal=NEW.ordinal;END");
  if(mutation==='revision')r.native().exec("CREATE TRIGGER erase_fault AFTER INSERT ON ik_d1_native_staging_values BEGIN UPDATE ik_d1_custody_states SET revision=revision+1;END");
  await assert.rejects(eraseD1ImportTarget('record','0',r.targets.remove('workspace','record','0'),r.context()),/IMPORT_ATOMIC_GUARD|IMPORT_NATIVE_STAGE_CONTENT_CHANGED|malformed JSON/);
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_jobs ORDER BY id').all(),before);
  assert.deepEqual((await r.targets.read(r.db(),'workspace','record','0'))!.value,r.source.records[0].payload);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_erased_targets').get()!.n,0);
  for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
});
