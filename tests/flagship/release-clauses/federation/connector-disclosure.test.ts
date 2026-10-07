import {env} from 'cloudflare:test';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {createApi} from '../../../../src/core/app/hono';
import {sessionFor} from '../../../e2e/setup/fixtures';
import {actors,connectNative,installation,reset,secret,trap} from './fixture';

beforeEach(reset);
afterEach(()=>vi.unstubAllGlobals());
it('SOURCE-001 — connector list binds current native identity and explicitly reports unavailable authority after identity failure',async()=>{
 const {owner,other}=await actors(),a=installation('alpha'),b=installation('beta'),transport=trap([a,b]);
 const first=await connectNative(owner,a),second=await connectNative(other,b);
 const app=createApi();
 const list=async(memberId:string)=>{
  const response=await app.request('http://localhost:8787/api/connectors',{headers:{Cookie:await sessionFor(memberId)}},{...env,CONNECTOR_CREDENTIALS_KEY:secret});
  expect(response.status).toBe(200);return response.json() as Promise<{items:any[];capabilities:any}>;
 };
 const ownerList=await list(owner.actor.id),otherList=await list(other.actor.id);
 expect(ownerList.items).toEqual([{id:first.value.id,provider:'happytohelp',accountId:a.config.accountId,state:'connected',revisionId:first.receipt.revisionId,identity:a.identity}]);
 expect(otherList.items).toEqual([{id:second.value.id,provider:'happytohelp',accountId:b.config.accountId,state:'connected',revisionId:second.receipt.revisionId,identity:b.identity}]);
 expect(ownerList.items[0].identity.capabilities.operations).toEqual([]);
 expect(ownerList.capabilities.happytohelp.requirements).toContain('customer replies and account activation are not delegated');
 expect(ownerList.capabilities.github).toMatchObject({write:false,exactRemoteRevision:false,retainedExactRevision:true});
 const rows=(await env.DB.prepare('SELECT id,member_id,account_id,config_json,credential_ciphertext,revision_id FROM federation_connections ORDER BY account_id').all<any>()).results;
 expect(rows).toHaveLength(2);
 for(const [row,p,ctx,result] of [[rows[0],a,owner,first],[rows[1],b,other,second]] as const){
  expect(row).toMatchObject({id:result.value.id,member_id:ctx.actor.id,account_id:p.config.accountId,revision_id:result.receipt.revisionId});
  expect(JSON.parse(row.config_json)).toEqual({...p.identity,nativeConfig:p.config});
  expect(row.credential_ciphertext).toBeTruthy();expect(row.credential_ciphertext).not.toContain(p.token);
  const lineage=await env.DB.prepare('SELECT entity_id,author_member_id,content_json FROM core_entity_revisions WHERE id=?').bind(row.revision_id).first<any>();
  expect(lineage).toMatchObject({entity_id:row.id,author_member_id:ctx.actor.id});
  expect(JSON.parse(lineage.content_json)).toEqual({provider:'happytohelp',accountId:p.config.accountId,principalId:p.identity.principalId,state:'connected'});
  for(const api of [ownerList,otherList]){const json=JSON.stringify(api);expect(json).not.toContain(p.token);expect(json).not.toContain(row.credential_ciphertext);expect(json).not.toContain('credential_ciphertext');}
 }
 const originalIdentity=structuredClone(a.identity);
 for(const field of ['installationId','principalId','grantId'] as const){
  a.identity[field]=`changed-${field}`;
  const failed=await list(owner.actor.id);
  expect(failed.items).toEqual([{id:first.value.id,provider:'happytohelp',accountId:a.config.accountId,state:'needs-attention',revisionId:first.receipt.revisionId,reason:'SOURCE_IDENTITY_CHANGED'}]);
  a.identity[field]=originalIdentity[field];
 }
 a.identityStatus=503;
 expect((await list(owner.actor.id)).items[0]).toMatchObject({state:'needs-attention',reason:'CONTROLLED_PROVIDER_REFUSAL'});
 expect((await list(owner.actor.id)).items[0]).not.toHaveProperty('identity');
 a.identityStatus=200;a.identity.capabilities.operations=['happytohelp.customer.reply'];
 expect((await list(owner.actor.id)).items[0]).toEqual({id:first.value.id,provider:'happytohelp',accountId:a.config.accountId,state:'needs-attention',revisionId:first.receipt.revisionId,reason:'INCOMPATIBLE_SOURCE'});
 a.identity=originalIdentity;
 expect((await list(owner.actor.id)).items).toEqual(ownerList.items);
 expect((await list(other.actor.id)).items).toEqual(otherList.items);
 expect((await env.DB.prepare('SELECT id,member_id,account_id,config_json,credential_ciphertext,revision_id FROM federation_connections ORDER BY account_id').all()).results).toEqual(rows);
 transport.assertClosed();expect(transport.calls.every(c=>c.path==='identity'&&c.method==='GET')).toBe(true);
 console.log('U2 connector effects',JSON.stringify({connections:rows.length,controlledCalls:transport.calls,operationalEffects:0}));
});
