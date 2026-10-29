import assert from 'node:assert/strict';
import {native,phases} from './fixtures.mjs';
export default async function({worker,name,args,who}) {
 const service=await worker('SlateAgentOperations');
 const context=phases.get('invocation')?.context;
 const before=context?(await native(context,'/api/containers')).items.length:null;
 const handle=await service.enqueue(name,JSON.parse(JSON.stringify(args)),JSON.parse(JSON.stringify(who)));
 const deadline=Date.now()+25_000;
 let result;
 while(Date.now()<deadline) {
  result=await service.result(handle.id,who);
  if(result)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(result,'Native queue must complete before the existing request deadline.');
 const after=context?(await native(context,'/api/containers')).items.length:null;
 if(result.code==='consent_revoked') {
  assert.equal(after,before);
  console.log(`Native queued consent probe: before=${before} after=${after} effects=0 code=consent_revoked`);
 } else console.log(`Native queued invocation: before=${before} after=${after} outcome=${result.outcome}`);
 return result;
}
