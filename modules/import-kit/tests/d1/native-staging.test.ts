import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture, nativePrivateTables } from './native-staging-fixture.ts';
import { resumeD1ImportStream, undoD1ImportStream, eraseD1ImportTarget, cancelD1NativeStaging } from '../../src/d1/index.ts';
const empty=(r:any)=>{for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get().n,0,table);};
test('one large native entity commits and cold reverses with every actual JSON batch bounded',async t=>{
  const r=await nativeStagingFixture(t),bytes:number[]=[];
  const context=()=>{const input=r.context(),database={prepare:input.storage.database.prepare,async batch(statements:any[]){bytes.push(Buffer.byteLength(JSON.stringify(statements.map(s=>({sql:s.query,params:s.values})))));return input.storage.database.batch(statements);}};return {...input,storage:{...input.storage,database}};};
  const job=await resumeD1ImportStream(r.job.id,context());assert.equal(job.state,'completed');
  assert.deepEqual((await r.targets.read(r.db(),'workspace','record','0'))!.value,r.source.records[0].payload);empty(r);
  r.reopen();assert.equal((await undoD1ImportStream(job.id,context())).state,'undone');empty(r);
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  assert.ok(bytes.length>5);assert.ok(bytes.every(n=>n<=2*1024*1024));
});
for(const table of ['index','values'])test(`native stage same-count ${table} substitution is refused before effects`,async t=>{
  const r=await nativeStagingFixture(t);
  if(table==='index')r.native().exec(`CREATE TRIGGER substitute_native_index BEFORE INSERT ON ik_d1_native_staging_index WHEN NEW.target_identity<>'${'f'.repeat(64)}' BEGIN INSERT INTO ik_d1_native_staging_index VALUES(NEW.stage_id,NEW.ordinal,NEW.source_identity,'${'f'.repeat(64)}');SELECT RAISE(IGNORE);END`);
  else r.native().exec("CREATE TRIGGER substitute_native_value BEFORE INSERT ON ik_d1_native_staging_values WHEN substr(NEW.body,1,1)<>'!' BEGIN INSERT INTO ik_d1_native_staging_values VALUES(NEW.stage_id,NEW.value_ordinal,NEW.ordinal,'!'||substr(NEW.body,2),NEW.body_hash,NEW.body_size,NEW.value_chunks);SELECT RAISE(IGNORE);END");
  await assert.rejects(resumeD1ImportStream(r.job.id,r.context()),/IMPORT_NATIVE_STAGE_CONTENT_CHANGED/);empty(r);assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
});
for(const mutation of ["UPDATE native_records SET value_json='changed'","UPDATE ik_jobs SET plan_json='{}'"])test(`late native stage cleanup cannot corrupt published state: ${mutation}`,async t=>{
  const r=await nativeStagingFixture(t);r.native().exec(`CREATE TRIGGER late_native_cleanup AFTER DELETE ON ik_d1_native_staging BEGIN ${mutation};END`);
  await assert.rejects(resumeD1ImportStream(r.job.id,r.context()),/PUBLICATION_CHANGED/);empty(r);assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
});
for(const recovery of ['cancel','resume','erase'])test(`fatal private native values remain indexed and support ${recovery}`,async t=>{
  const r=await nativeStagingFixture(t),input=r.context();let stopped=false,batches=0;
  const database={prepare:input.storage.database.prepare,async batch(statements:any[]){if(statements.some(s=>s.query.startsWith('INSERT INTO ik_d1_native_staging_values'))&&++batches===2)stopped=true;if(stopped)throw new Error('runtime stopped');return input.storage.database.batch(statements);}};
  await assert.rejects(resumeD1ImportStream(r.job.id,{...input,storage:{...input.storage,database}}),/runtime stopped/);
  assert.ok(Number(r.native().prepare('SELECT count(*) n FROM ik_d1_native_staging_values').get()!.n)>0);assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  r.reopen();
  if(recovery==='cancel')await cancelD1NativeStaging(r.job.id,r.context());
  if(recovery==='resume')assert.equal((await resumeD1ImportStream(r.job.id,r.context())).state,'completed');
  if(recovery==='erase'){await eraseD1ImportTarget('record','0',[],{...r.context(),authorization:{...r.context().authorization,principalId:'privacy-owner'}});await resumeD1ImportStream(r.job.id,r.context());assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);}
  empty(r);
});
