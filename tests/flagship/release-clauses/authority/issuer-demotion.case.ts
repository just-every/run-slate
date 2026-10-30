import {env} from 'cloudflare:test';
import {expect,vi} from 'vitest';
import {effectFixture,effects,secret} from './fixture';
import {seedMember,sessionFor} from '../../../e2e/setup/fixtures';
import {createApi} from '../../../../src/core/app/hono';
import {prepareEffect} from '../../../../src/core/features/effects/service';
import type {AppBindings} from '../../../../src/core/app/types';

/** Only the provider network edge is faked by effectFixture. */
export async function issuerDemotionCase(demote:boolean){
 const f=await effectFixture('procedure'),api=createApi();
 const {memberId:issuer}=await seedMember(f.workspaceId,{role:'owner',email:'synthetic-slate-issuer@example.test',displayName:'Credential issuer'});
 const cookies=new Map([[issuer,await sessionFor(issuer,{freshProof:true})],[f.owner,await sessionFor(f.owner,{freshProof:true})]]);
 const person=async(member:string,path:string,method='GET',input?:unknown)=>{
  const r=await api.request('https://local.test'+path,{method,headers:{cookie:cookies.get(member)!,origin:'https://local.test','content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})},{...env,APP_URL:'https://local.test',AI_API_KEY:'test-only',CONNECTOR_CREDENTIALS_KEY:secret} as AppBindings);
  const body=await r.json<any>();expect(r.status,JSON.stringify(body)).toBe(200);return body;
 };
 const issued=await person(issuer,'/api/agent/credentials','POST',{operationKey:'delegated-dispatch-credential',subjectId:f.owner,expiresAt:'2099-01-01T00:00:00.000Z',scope:{tools:['dispatch_effect','run_status'],sourceIds:[f.page.pageId],audience:[f.owner,f.reader],grantIds:[f.grant.value.id]}});
 await person(f.owner,'/agents/api/policy','PUT',{document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'ordinary',class:'standard',do:'autonomous'},{id:'outside',class:'external',do:'approval',approver:['role:owner'],wait:'P1D'},{id:'sensitive',class:'sensitive',do:'autonomous'}],spend:{none:true}}});
 const provider=globalThis.fetch;
 vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(init?.method==='PATCH'&&url.origin==='https://api.github.com'&&url.pathname==='/repos/just-every/run-slate/issues/1'){
   f.sends.push('PATCH '+url);Object.assign(f.issue,JSON.parse(String(init.body)),{updated_at:'2026-10-30T00:00:00Z'});return Response.json(f.issue);
  }
  return provider(input,init);
 });
 const prepared=await prepareEffect(f.context(),f.input);
 const held=await f.mcp(issued.token,'dispatch_effect',{id:prepared.value.id});
 expect(held.status).toBe(200);
 expect(held.value.code).toBe('approval_required');
 const approvalId=held.body.result._meta['com.runeditrun/error'].approval.id;
 const pending=(await person(f.owner,'/agents/api/approvals/'+approvalId)).approval;
 expect(pending.state).toBe('pending');expect(f.sends).toEqual([]);
 if(demote)await person(f.owner,'/api/members/'+issuer+'/role','PUT',{operationKey:'demote-credential-issuer',expectedRole:'owner',role:'member'});
 const fresh=await f.mcp(issued.token,'run_status',{id:f.run.value.id});
 const approved=(await person(f.owner,'/agents/api/approvals/'+approvalId+'/approve','POST',{revision:pending.revision,summary_sha256:pending.summary_sha256})).approval;
 const receipt={freshBearerStatus:fresh.status,approvalState:approved.state,approvalCode:approved.code,providerSendCount:f.sends.length,providerMethods:f.sends.map(send=>send.split(' ')[0])};
 if(demote){
  expect(receipt).toEqual({freshBearerStatus:401,approvalState:'refused',approvalCode:'insufficient_scope',providerSendCount:0,providerMethods:[]});
  expect((await effects(f.workspaceId)).find(row=>row.id===prepared.value.id)).toMatchObject({state:'prepared',dispatched_at:null,receipt_json:null});
  // The current sponsor's independent grant survives the issuer's demotion.
  expect(await env.DB.prepare('SELECT owner_id,revoked_at FROM intelligence_grants WHERE id=?').bind(f.grant.value.id).first()).toMatchObject({owner_id:f.owner,revoked_at:null});
 }else{
  expect(receipt).toEqual({freshBearerStatus:200,approvalState:'executed',approvalCode:null,providerSendCount:1,providerMethods:['PATCH']});
  expect((await effects(f.workspaceId)).find(row=>row.id===prepared.value.id)).toMatchObject({state:'confirmed'});
  expect(f.issue.body).toBe(f.input.content.body);
 }
 const replay=(await person(f.owner,'/agents/api/approvals/'+approvalId+'/approve','POST',{revision:pending.revision,summary_sha256:pending.summary_sha256})).approval;
 expect(replay.state).toBe(approved.state);expect(f.sends).toHaveLength(receipt.providerSendCount);
 return receipt;
}
