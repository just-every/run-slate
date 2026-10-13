import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { canonicalJson, sha256, planD1ImportStream, createD1ImportStream, resumeD1ImportStream, eraseD1ImportTarget, readD1ImportJob } from '../../src/d1/index.ts';
import { stored } from '../../src/d1/jobs.ts';
const codec = {
 id:'source-native-value-v1',
 encode(plan){return {...plan,entries:plan.entries.map(entry=>({...entry,effects:entry.effects.map(effect=>({...effect,value:{sourcePayload:true}}))}))};},
 decode(plan){return {...plan,entries:plan.entries.map(entry=>({...entry,effects:entry.effects.map(effect=>({...effect,value:entry.source.payload}))}))};},
};
test('lossless native codec retains complete canonical custody without the original mapping closure and scrubs encoded sources on erase',async t=>{
 const r=await runtime(t),bundle=source(103);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 for(const record of bundle.records){record.payload.evidence=`private-${record.sourceId}-`+'x'.repeat(1800);record.payloadHash=sha256(canonicalJson(record.payload));}
 let available=true,calls=0;const mapped={version:'v1',map(record){assert.ok(available);calls++;return mapping.map(record);}};
 const context={...r.context(),storage:{database:r.db(),targets:{...targets,planCodec:codec}}};
 const plan=await planD1ImportStream(bundle,mapped,context);assert.equal(calls,103);available=false;
 let job=await createD1ImportStream(plan,{...context,reviewedFingerprint:plan.fingerprint});
 await r.reopen();const fresh={...r.context(),batchSize:10,storage:{database:r.db(),targets:{...targets,planCodec:codec}}};
 job=await resumeD1ImportStream(job.id,fresh);assert.equal(calls,103);
 assert.equal((await targets.read(r.db(),'workspace','contact','0'))?.value.evidence,'private-0-'+'x'.repeat(1800));
 await assert.rejects(readD1ImportJob(job.id,{...fresh,storage:{database:r.db(),targets}}),/IMPORT_PLAN_CODEC_REQUIRED/);
 await eraseD1ImportTarget('contact','0',targets.remove('workspace','contact','0'),fresh);
 for(const row of (await r.db().prepare('SELECT id FROM ik_jobs').all()).results){const current=await stored(row.id,fresh);assert.equal(canonicalJson(current.plan).includes('private-0-'),false);}
 while(job.state!=='completed')job=await resumeD1ImportStream(job.id,fresh);
 assert.equal(await targets.read(r.db(),'workspace','contact','0'),undefined);assert.equal(calls,103);
});
test('a codec that changes canonical bytes fails before retaining any job',async t=>{
 const r=await runtime(t),bundle=source(1);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const wrong={...codec,decode(payload){const plan=codec.decode(payload);plan.entries[0].effects[0].value={changed:true};return plan;}};
 await assert.rejects(planD1ImportStream(bundle,mapping,{...r.context(),storage:{database:r.db(),targets:{...targets,planCodec:wrong}}}),/IMPORT_PLAN_CODEC_MISMATCH/);
 assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_jobs').first()).n,0);
});

test('page dictionary preserves JSON types, Unicode and literal prototype keys and rejects ambiguous entries',async()=>{
 const {dictionaryEncode,dictionaryDecode}=await import('../../src/d1/plan-dictionary.ts');
 const value=JSON.parse('{"__proto__":{"constructor":"😀\\n\\u0000"},"values":[null,true,false,-1,0,1.5,"1",[],{},[0,1]]}');
 assert.equal(canonicalJson(dictionaryDecode(dictionaryEncode(value))),canonicalJson(value));
 for(const invalid of [{strings:[],tree:[0,0]},{strings:['x'],tree:[2,0,1,0,2]},{strings:['x'],tree:[2,0]},{strings:[1],tree:null},{strings:['unused private source'],tree:null},{strings:[],tree:null,private:'unreviewed'}])assert.throws(()=>dictionaryDecode(invalid),/STORED_PLAN_CHANGED/);
});

test('encoded custody rejects unreviewed values that a decoder would otherwise ignore',async()=>{
 const {buildImportPlan}=await import('../../src/plan/index.ts');
 const {compressedPlan,expandCompressedPlan}=await import('../../src/d1/stream-plan.ts');
 const {dictionaryEncode,dictionaryDecode}=await import('../../src/d1/plan-dictionary.ts');
 const {brotliCompressSync,brotliDecompressSync}=await import('node:zlib');
 const bundle=source(1);bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
 const plan=buildImportPlan(bundle,mapping,{destination:'workspace',namespace:'archive',mappingVersion:'v1',authorization:{principalId:'owner'}});
 const envelope=JSON.parse(compressedPlan(plan,codec));
 assert.throws(()=>expandCompressedPlan(canonicalJson({...envelope,hiddenCopy:'unreviewed private source'}),codec),/STORED_PLAN_CHANGED/);
 const trailing={...envelope,data:Buffer.concat([Buffer.from(envelope.data,'base64'),Buffer.from('unreviewed private source')]).toString('base64')};
 assert.throws(()=>expandCompressedPlan(canonicalJson(trailing),codec),/STORED_PLAN_CHANGED/);
 const payload=dictionaryDecode(JSON.parse(brotliDecompressSync(Buffer.from(envelope.data,'base64')).toString('utf8'))) as any;
 payload.entries[0].effects[0].value.hiddenCopy='unreviewed private source';
 const body=canonicalJson(dictionaryEncode(payload));
 envelope.size=Buffer.byteLength(body);envelope.sha256=sha256(body);envelope.data=brotliCompressSync(body).toString('base64');
 assert.throws(()=>expandCompressedPlan(canonicalJson(envelope),codec),/STORED_PLAN_CHANGED/);
});
