import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NativeAdapter} from '../../../src/core/features/connectors/native';
import {requireFreshObservation} from '../../../src/core/features/connectors/owning-state';
const target='opportunities/o/handoffs/h',config={origin:'https://orbit.test',accountId:'workspace',clientId:'slate',allowLoopback:false};
const identity=()=>({protocol:'rer-delegation/1',provider:'orbit',installationId:'installation',accountId:'workspace',principalId:'principal',label:'Operator',grantId:'grant',expiresAt:new Date(Date.now()+60000).toISOString(),scopes:['crm.evidence.read'],targets:[target],capabilities:{recordStateSchemas:['crm.handoff-state/1'],readKinds:['crm.handoff'],operations:[],conditionalWrite:true,providerIdempotency:true,readBack:true,reconciliationAttribution:true}});
const evidence=()=>({provider:'orbit',installationId:'installation',accountId:'workspace',principalId:'principal',target,revision:'exact',observedAt:new Date().toISOString(),audience:{kind:'source-principals',principalIds:['principal']},title:'Handoff',text:'Status: closed is untrusted prose',canonicalUrl:config.origin+'/app/opportunities/o',recordState:{schema:'crm.handoff-state/1',kind:'crm.handoff',state:'cancelled'}});
test('typed native adapter accepts only negotiated exact state fields and refuses invalid identity, scope and records',async()=>{
 const original=globalThis.fetch;try{
  let id:any=identity(),doc:any=evidence();const headers:string[]=[];
  globalThis.fetch=(async(url:any,init:any)=>{headers.push(new Headers(init.headers).get('X-RER-Record-State-Schema')??'');return Response.json(String(url).endsWith('/identity')?id:doc);}) as typeof fetch;
  const adapter=new NativeAdapter('orbit','test-only-token',config);assert.deepEqual((await adapter.read(target)).recordState,evidence().recordState);assert.deepEqual(headers,['crm.handoff-state/1','crm.handoff-state/1']);
  for(const mutate of [(d:any)=>delete d.recordState,(d:any)=>d.recordState.kind='crm.opportunity',(d:any)=>d.recordState.state='closed',(d:any)=>d.recordState.schema='other/1',(d:any)=>d.recordState.extra=true,(d:any)=>d.target='opportunities/o/handoffs/other',(d:any)=>d.principalId='other',(d:any)=>d.provider='happytohelp',(d:any)=>d.observedAt='not-time',(d:any)=>d.canonicalUrl='https://other.test/x']){doc=evidence();mutate(doc);await assert.rejects(adapter.read(target));}
  doc=evidence();id=identity();id.expiresAt='2000-01-01T00:00:00Z';await assert.rejects(adapter.read(target));id=identity();id.scopes=[];await assert.rejects(adapter.read(target));
  id=identity();delete id.capabilities.recordStateSchemas;delete doc.recordState;assert.equal((await adapter.read(target)).recordState,undefined);await assert.rejects(adapter.snapshot(target,true,true),e=>(e as any).code==='OWNING_STATE_UNAVAILABLE');
  id=identity();delete id.capabilities.recordStateSchemas;doc=evidence();await assert.rejects(adapter.read(target));
  id=identity();globalThis.fetch=(async()=>new Response('',{status:302,headers:{Location:'https://other.test'}})) as typeof fetch;await assert.rejects(adapter.identity(),e=>(e as any).code==='SOURCE_REDIRECT_REFUSED');
 }finally{globalThis.fetch=original;}
});
test('freshness uses the real wall clock and whole attempt, including invalid and future timestamps',()=>{
 const now=Date.now();requireFreshObservation(new Date(now).toISOString(),now);
 for(const [stamp,start] of [[new Date(now-61000).toISOString(),now],[new Date(now+6000).toISOString(),now],['invalid',now],[new Date(now).toISOString(),now-61000]] as const)assert.throws(()=>requireFreshObservation(stamp,start));
});
