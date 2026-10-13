import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSqliteImportStorage, readFileSource, planImport, createImportJob, applyImportBatches, undoImport, reconcileImport, readPersistedImport, sha256 } from '../../src/index.ts';
import { lilyTargets, snapshot } from '../../proof/zendesk/sqlite.ts';
import { differences, outcomeCounts, normalizeTables } from '../../proof/zendesk/compare.ts';
test('native SQLite adapter publishes attributed physical rows and detects native edits',async()=>{
 const root=await mkdtemp(join(tmpdir(),'zendesk-native-'));const storage=openSqliteImportStorage(join(root,'target.sqlite'),{targets:lilyTargets});
 try{
  storage.database.exec('CREATE TABLE customers(id TEXT PRIMARY KEY, name TEXT NOT NULL)');
  const context:any={storage,destination:'native',namespace:'synthetic',mappingVersion:'test-only',authorization:{principalId:'admin',assertAuthorized:()=>{}},batchSize:1};
  const source=await readFileSource({namespace:'synthetic',name:'test.ndjson',bytes:Buffer.from('{"user":{"id":1,"name":"Original"}}'),format:'ndjson',parse:(v:any)=>({kind:'user',sourceId:String(v.user.id),payload:v.user})});
  const baseline=snapshot(storage.database);
  const plan=planImport(source,{version:'test-only',map:r=>({effects:[{targetKind:'customers',targetId:'["native-user"]',value:{row:{id:'native-user',name:(r.payload as any).name},generated:false}}]})},context);
  context.reviewedFingerprint=plan.fingerprint;const job=await createImportJob(plan,context);await applyImportBatches(job,context);
  assert.equal(storage.database.prepare('SELECT name FROM customers').get().name,'Original');assert.equal(reconcileImport(plan,readPersistedImport(context),context).ok,true);
  storage.database.prepare("UPDATE customers SET name='Native edit'").run();
  assert.equal(reconcileImport(plan,readPersistedImport(context),context).ok,false);
  await assert.rejects(undoImport(job.id,context),/NATIVE_EDIT_CONFLICT/);
  assert.equal(storage.database.prepare('SELECT name FROM customers').get().name,'Native edit');
 }finally{storage.close();await rm(root,{recursive:true,force:true});}
});
test('comparison includes values, source outcome kinds, and only execution-time normalization',()=>{
 assert.deepEqual(outcomeCounts([{type:'ticket',outcome:'imported'},{type:'comment',outcome:'private'}]),{total:2,byKind:{ticket:1,comment:1},byOutcome:{imported:1,private:1}});
 assert.deepEqual(differences({tickets:[{id:'1',subject:'A'}]},{tickets:[{id:'1',subject:'B'}]}),['tickets']);
 assert.deepEqual(normalizeTables({tickets:[{created_at:'source-time',updated_at:'run-time'}]},'run-time'),{tickets:[{created_at:'source-time',updated_at:'$IMPORT_TIME'}]});
});
test('native partial failure rollback removes committed physical effects',async()=>{
 const root=await mkdtemp(join(tmpdir(),'zendesk-rollback-'));const storage=openSqliteImportStorage(join(root,'target.sqlite'),{targets:lilyTargets});
 try{
  storage.database.exec("CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL); CREATE TRIGGER reject_second BEFORE INSERT ON customers WHEN NEW.id='2' BEGIN SELECT RAISE(ABORT,'native failure'); END;");
  const context:any={storage,destination:'native',namespace:'synthetic',mappingVersion:'rollback-test',authorization:{principalId:'admin',assertAuthorized:()=>{}},batchSize:1};
  const source=await readFileSource({namespace:'synthetic',name:'test.json',bytes:Buffer.from('[{"id":"1"},{"id":"2"}]'),format:'json',parse:(v:any)=>({kind:'user',sourceId:v.id,payload:v})});
  const plan=planImport(source,{version:'rollback-test',map:r=>({effects:[{targetKind:'customers',targetId:JSON.stringify([r.sourceId]),value:{row:{id:r.sourceId,name:r.sourceId},generated:false}}]})},context);context.reviewedFingerprint=plan.fingerprint;
  const job=await createImportJob(plan,context);await assert.rejects(applyImportBatches(job,context),/native failure/);
  assert.deepEqual(storage.database.prepare('SELECT id FROM customers').all().map(r=>r.id),['1']);
  const {rollbackImport}=await import('../../src/index.ts');assert.equal((await rollbackImport(job.id,context)).state,'rolled_back');assert.equal(storage.database.prepare('SELECT count(*) AS n FROM customers').get().n,0);
 }finally{storage.close();await rm(root,{recursive:true,force:true});}
});
