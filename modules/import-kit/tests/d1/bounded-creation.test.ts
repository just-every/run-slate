import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime } from './retained-fixtures.ts';
import { sqliteSource,sqliteMapping } from './sqlite-runtime.ts';
import { planD1Import,createD1ImportJob,preflightD1ImportJob,readD1ImportOriginals } from '../../src/d1/index.ts';

for(const [name,mutation] of [
  ['checkpoint','UPDATE ik_jobs SET checkpoint=1'],
  ['extra original',"INSERT INTO ik_originals(job_id,kind,original_key,name,sha256,size,bytes) SELECT id,'artifact','extra','extra','extra',0,NULL FROM ik_jobs WHERE NOT EXISTS(SELECT 1 FROM ik_originals WHERE original_key='extra')"],
  ['extra index',"INSERT INTO ik_d1_plan_index(job_id,ordinal,source_identity,target_identity) SELECT id,99,'extra','extra' FROM ik_jobs WHERE NOT EXISTS(SELECT 1 FROM ik_d1_plan_index WHERE ordinal=99)"],
  ['missing index','DELETE FROM ik_d1_plan_index'],
  ['original metadata',"UPDATE ik_originals SET name='changed'"],
  ['original version','UPDATE ik_original_sets SET version=4'],
  ['current authority',"UPDATE native_authority SET enabled=0 WHERE id='owner'"],
])test(`bounded ordinary creation checks ${name} after assertion cleanup`,async t=>{
  const r=await sqliteRuntime(t),context=()=>({...r.context(),maxBatchBytes:2*1024*1024}),source=sqliteSource(1);
  const plan=await planD1Import(source,sqliteMapping,context());
  r.native().exec(`CREATE TRIGGER creation_cleanup AFTER DELETE ON ik_d1_assertions WHEN EXISTS(SELECT 1 FROM ik_jobs) BEGIN ${mutation};END`);
  await assert.rejects(createD1ImportJob(plan,{...context(),reviewedFingerprint:plan.fingerprint}),/IMPORT_ATOMIC_GUARD|malformed JSON/);
  for(const row of r.native().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ik_%'").all())assert.equal(r.native().prepare(`SELECT count(*) n FROM ${row.name}`).get()!.n,0,row.name as string);
  assert.equal(r.native().prepare("SELECT enabled FROM native_authority WHERE id='owner'").get()!.enabled,1);
  r.native().exec('DROP TRIGGER creation_cleanup');
  const job=await createD1ImportJob(plan,{...context(),reviewedFingerprint:plan.fingerprint});
  assert.equal(job.checkpoint,0);assert.equal(job.state,'queued');
  const originals=await readD1ImportOriginals(job.id,context());
  assert.deepEqual(originals[0].original,{status:'retained',base64:(source.artifacts[0].original as {base64:string}).base64});
});

test('bounded ordinary creation preflight includes exact final checks and its real return path',async t=>{
  const r=await sqliteRuntime(t),base=r.context(),source=sqliteSource(1),plan=await planD1Import(source,sqliteMapping,base);
  let queries=0;const wire:number[]=[];
  const wrap=(statement:any):any=>({query:statement.query,values:statement.values,bind(...values:any[]){return wrap(statement.bind(...values));},async first(){queries++;return statement.first();},async all(){queries++;return statement.all();}});
  const database={prepare:(sql:string)=>wrap(base.storage.database.prepare(sql)),async batch(statements:any[]){queries++;wire.push(Buffer.byteLength(JSON.stringify(statements.map(s=>({sql:s.query,params:s.values})))));return base.storage.database.batch(statements);}};
  const context={...base,maxBatchBytes:2*1024*1024,reviewedFingerprint:plan.fingerprint,storage:{...base.storage,database}};
  const admitted=preflightD1ImportJob(plan,context);
  await createD1ImportJob(plan,context);
  assert.equal(queries,admitted.totalExecutions);assert.ok(queries<=1000);assert.ok(wire.every(size=>size<=2*1024*1024));
});
