import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture, nativePrivateTables } from './native-staging-fixture.ts';
import { sqliteMapping } from './sqlite-runtime.ts';
import { readApiSource } from '../../src/readers/index.ts';
import { planD1Import, createD1ImportJob, resumeD1Import, resumeD1ImportStream, undoD1Import, eraseD1ImportTarget, readD1ImportOriginals } from '../../src/d1/index.ts';

test('privacy staging admits explicit raw withdrawal alongside large native values and preserves unrelated exact bytes',async t=>{
  const r=await nativeStagingFixture(t);
  let stream=await resumeD1ImportStream(r.job.id,r.context());
  while(stream.state!=='completed')stream=await resumeD1ImportStream(r.job.id,r.context());
  const pii='staged-person@example.test';
  const pages=[JSON.stringify({records:[{id:'0',rows:[pii]}],next:'https://source.test/peer'}),JSON.stringify({wrapper:'unrelated'.repeat(15000),records:[{id:'1',rows:['Peer']} ]})];
  const source=await readApiSource({namespace:'archive',url:'https://source.test/page',parsePage:(value:any)=>({records:value.records.map((payload:any)=>({kind:'record',sourceId:payload.id,payload:{rows:payload.rows}})),next:value.next})},async request=>new Response(pages[request.url.endsWith('/peer')?1:0]));
  const plan=await planD1Import(source,sqliteMapping,r.context());
  const pending=await createD1ImportJob(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
  const base=r.context(),bytes:number[]=[];let staged=0;
  const database={prepare:base.storage.database.prepare,async batch(statements:any[]){
    bytes.push(Buffer.byteLength(JSON.stringify(statements.map(s=>({sql:s.query,params:s.values})))));
    staged+=Number(statements.some(s=>s.query.startsWith('INSERT INTO ik_d1_native_staging_values')));
    return base.storage.database.batch(statements);
  }};
  const result=await eraseD1ImportTarget('record','0',r.targets.remove('workspace','record','0'),{...base,originalErasurePolicy:'withdraw-affected-artifacts',storage:{...base.storage,database}});
  assert.equal(result.erasedRecords,2);assert.ok(staged>0);assert.ok(bytes.every(size=>size<=base.maxBatchBytes));
  const originals=await readD1ImportOriginals(pending.id,r.context());
  assert.equal(originals[0].original.status,'unavailable');
  assert.equal(originals[1].original.status,'retained');
  if(originals[1].original.status==='retained')assert.equal(Buffer.from(originals[1].original.base64,'base64').toString(),pages[1]);
  for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0);
  const tables=r.native().prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  for(const row of tables)assert.ok(!JSON.stringify(r.native().prepare(`SELECT * FROM ${row.name}`).all()).includes(pii));
  r.reopen();await resumeD1Import(pending.id,r.context());
  assert.equal(await r.targets.read(r.db(),'workspace','record','0'),undefined);
  assert.deepEqual((await r.targets.read(r.db(),'workspace','record','1'))!.value,{rows:['Peer']});
  await undoD1Import(pending.id,r.context());
  assert.equal(await r.targets.read(r.db(),'workspace','record','0'),undefined);
});
