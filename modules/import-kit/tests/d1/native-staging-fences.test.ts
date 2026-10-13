import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture, nativePrivateTables } from './native-staging-fixture.ts';
import { resumeD1ImportStream, cancelD1NativeStaging } from '../../src/d1/index.ts';
import { requestContext } from '../../src/d1/budget.ts';
const empty=(r:any)=>{for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);};
for(const mutation of ['UPDATE native_clock SET value=value+1',"UPDATE native_authority SET enabled=0 WHERE id='owner'",'UPDATE ik_d1_custody_revisions SET revision=revision+1'])test(`native private writes fence concurrent state: ${mutation}`,async t=>{
  const r=await nativeStagingFixture(t);
  r.native().exec(`CREATE TRIGGER change_during_values AFTER INSERT ON ik_d1_native_staging_values BEGIN ${mutation};END`);
  await assert.rejects(resumeD1ImportStream(r.job.id,r.context()),/IMPORT_ATOMIC_GUARD/);
  empty(r);assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  assert.equal(r.native().prepare("SELECT enabled FROM native_authority WHERE id='owner'").get()!.enabled,1);
});
test('native staging reserves the request budget before retaining private values',async t=>{
  const r=await nativeStagingFixture(t),context=requestContext(r.context());
  for(let i=0;i<930;i++)await context.storage.database.prepare('SELECT 1').first();
  await assert.rejects(resumeD1ImportStream(r.job.id,context),/IMPORT_D1_REQUEST_LIMIT/);empty(r);
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
});
test('current authority and job ownership are required to cancel a private native generation',async t=>{
  const r=await nativeStagingFixture(t),input=r.context();let stopped=false;
  const database={prepare:input.storage.database.prepare,async batch(statements:any[]){if(statements.some(s=>s.query.startsWith('INSERT INTO ik_d1_native_staging_values')))stopped=true;if(stopped)throw new Error('runtime stopped');return input.storage.database.batch(statements);}};
  await assert.rejects(resumeD1ImportStream(r.job.id,{...input,storage:{...input.storage,database}}),/runtime stopped/);
  const before=r.native().prepare('SELECT * FROM ik_d1_native_staging').all();assert.equal(before.length,1);
  await assert.rejects(cancelD1NativeStaging(r.job.id,{...r.context(),authorization:{...r.context().authorization,principalId:'other-owner'}}),/IMPORT_ATOMIC_GUARD/);
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_native_staging').all(),before);
  r.native().exec("UPDATE native_authority SET enabled=0 WHERE id='owner'");
  await assert.rejects(cancelD1NativeStaging(r.job.id,r.context()),/IMPORT_ATOMIC_GUARD/);
  assert.deepEqual(r.native().prepare('SELECT * FROM ik_d1_native_staging').all(),before);
  r.native().exec("UPDATE native_authority SET enabled=1 WHERE id='owner'");
  r.reopen();await cancelD1NativeStaging(r.job.id,r.context());empty(r);
});

test('a stale native stage cannot delete or replace the concurrent winner',async t=>{
  const r=await nativeStagingFixture(t),input=r.context();let raced=false,winner:any;
  const database={prepare:input.storage.database.prepare,async batch(statements:any[]){if(!raced&&statements.some(s=>s.query.startsWith('INSERT INTO ik_d1_native_staging_values'))){raced=true;winner=await resumeD1ImportStream(r.job.id,r.context());}return input.storage.database.batch(statements);}};
  await assert.rejects(resumeD1ImportStream(r.job.id,{...input,storage:{...input.storage,database}}),/IMPORT_ATOMIC_GUARD/);
  assert.equal(winner.state,'completed');empty(r);
  assert.deepEqual((await r.targets.read(r.db(),'workspace','record','0'))!.value,r.source.records[0].payload);
  assert.equal((await resumeD1ImportStream(r.job.id,r.context())).state,'completed');
});
