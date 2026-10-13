import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping } from './d1/fixtures.ts';
import { planD1ImportStream, createD1ImportStream } from '../src/d1/index.ts';
import { buildImportPlan } from '../src/plan/index.ts';
import { streamView } from '../src/d1/stream-plan.ts';
import { canonicalJson, sha256 } from '../src/provenance/identity.ts';

const oracle = (value: any): string => {
  if (Array.isArray(value)) return '[' + Array.from({length:value.length},(_,index)=>oracle(value[index])).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+oracle(value[key])).join(',') + '}';
  return JSON.stringify(value);
};

test('initial source-page reuse preserves the independent complete canonical fingerprint and maps each record once', async t => {
  const r=await runtime(t), bundle=source(257);
  bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
  for(const [index,record] of bundle.records.entries()) {
    record.payload={ index, value:[null,false,0,'0','漢😀\ud800'], nested:JSON.parse('{"10":1,"2":"two","__proto__":{"own":true}}') };
    record.payloadHash=sha256(oracle(record.payload));
  }
  const expected=buildImportPlan(bundle,mapping,r.context());
  let calls=0;
  const stream=await planD1ImportStream(bundle,{version:mapping.version,map(record){calls++;return mapping.map(record);}},r.context());
  const {fingerprint:_fingerprint,...body}=expected;
  assert.equal(stream.fingerprint,sha256(oracle(body)));
  assert.equal(canonicalJson(streamView(stream)),canonicalJson(expected));
  assert.equal(calls,257);
  bundle.records=[];
  await createD1ImportStream(stream,{...r.context(),reviewedFingerprint:stream.fingerprint});
  assert.equal(calls,257);
});

test('a source changed by mapping is refused before a stream can be published', async t => {
  const r=await runtime(t), bundle=source(3);
  bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
  await assert.rejects(planD1ImportStream(bundle,{version:mapping.version,map(record){bundle.records[0].sourceId='changed-after-normalization';return mapping.map(record);}},r.context()),/IMPORT_STREAM_SOURCE_CHANGED/);
  assert.equal((await r.db().prepare('SELECT count(*) n FROM ik_jobs').first())!.n,0);
});

test('target identity guards still reject a duplicate across independent normalized pages before custody', async t => {
  const r=await runtime(t), bundle=source(101);
  bundle.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
  const duplicate={version:mapping.version,map(record: any){return {effects:[{targetKind:'contact',targetId:record.sourceId==='100'?'0':record.sourceId,value:record.payload}]};}};
  await assert.rejects(planD1ImportStream(bundle,duplicate,r.context()),/DUPLICATE_TARGET/);
  assert.equal((await r.db().prepare('SELECT count(*) n FROM ik_jobs').first())!.n,0);
});
