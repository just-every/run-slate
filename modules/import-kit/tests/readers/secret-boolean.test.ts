import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSource, readApiSource } from '../../src/readers/index.ts';
import { planD1Import, createD1ImportJob, readD1ImportOriginals, resumeD1Import, canonicalJson, sha256 } from '../../src/d1/index.ts';
import { sqliteRuntime, sqliteMapping, sqliteTargets } from '../d1/sqlite-runtime.ts';

test('public readers and durable planning retain boolean secret semantics with exact originals and refuse credential values',async t=>{
  const r=await sqliteRuntime(t);
  const parse=(value:any)=>value.collection.map((payload:any)=>({kind:'record',sourceId:payload.uri,payload}));
  for(const secret of [true,false])for(const api of [false,true]){
    const bytes=Buffer.from(JSON.stringify({collection:[{uri:`https://api.calendly.com/event_types/example-${api}-${secret}`,secret}]}));
    const source=api?await readApiSource({namespace:'archive',url:'https://api.calendly.com/event_types',parsePage:value=>({records:parse(value)})},async()=>new Response(bytes)):await readFileSource({namespace:'archive',name:'event.json',format:'json',bytes,parse});
    const plan=await planD1Import(source,sqliteMapping,r.context());
    const job=await createD1ImportJob(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
    await resumeD1Import(job.id,r.context());
    const changed=structuredClone(source);
    changed.records[0].payload={secret:'synthetic-credential'};
    changed.records[0].payloadHash=sha256(canonicalJson(changed.records[0].payload));
    await assert.rejects(planD1Import(changed,sqliteMapping,r.context()),/CREDENTIAL_IN_DURABLE_DATA/);
    const original=(await readD1ImportOriginals(job.id,r.context()))[0].original;
    assert.equal(original.status,'retained');
    if(original.status==='retained')assert.deepEqual(Buffer.from(original.base64,'base64'),bytes);
    assert.deepEqual((await sqliteTargets.read(r.db(),'workspace','record',source.records[0].sourceId))!.value,source.records[0].payload);
  }
  for(const secret of ['synthetic-credential',{value:'synthetic-credential'},null,1]){
    const bytes=Buffer.from(JSON.stringify({collection:[{uri:'https://source.test/event',secret}]}));
    // Inspect raw originals even when the parser intentionally drops metadata.
    await assert.rejects(readFileSource({namespace:'archive',name:'event.json',format:'json',bytes,parse:()=>[]}),/INVALID_OR_CREDENTIAL_SOURCE_DATA/);
    await assert.rejects(readApiSource({namespace:'archive',url:'https://source.test/events',parsePage:()=>({records:[]})},async()=>new Response(bytes)),/INVALID_OR_CREDENTIAL_SOURCE_DATA/);
  }
});
