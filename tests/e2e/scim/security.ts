import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { createUlid } from '../../../src/core/shared/ulid';
import { seedMember, sessionFor } from '../setup/fixtures';
import { user, patch, type scimFixture } from './support';
export async function protocolJourney(f:Awaited<ReturnType<typeof scimFixture>>) {
  for(const path of ['/ServiceProviderConfig','/ResourceTypes','/Schemas']){
    const anonymous=await f.request(path,'GET',undefined,'');expect(anonymous.status).toBe(401);expect(anonymous.data.status).toBe('401');
    const data=await f.scim(path);expect(Array.isArray(data.schemas)).toBe(true);
  }
  for(const type of ['User','Group']){expect((await f.scim('/ResourceTypes/'+type)).name).toBe(type);expect((await f.scim('/Schemas/'+encodeURIComponent(`urn:ietf:params:scim:schemas:core:2.0:${type}`))).name).toBe(type);}
  for(const [path,scimType] of [['/Users?filter=active%20eq%20true','invalidFilter'],['/Users?startIndex=bad','invalidValue'],['/Users?count=-1','invalidValue']] as const){const result=await f.request(path);expect(result.status).toBe(400);expect(result.data.scimType).toBe(scimType);}
  for(const actor of [f.member,f.guest]){
    const response=await f.api.request('https://slate.test/api/developer/scim',{method:'POST',headers:{cookie:f.cookies[actor]!,'content-type':'application/json'},body:JSON.stringify({operationKey:createUlid(),name:'Not authorized'})},{...env,SLATE_PROFILE:undefined});expect(response.status).toBe(403);
  }
  for(const [body,contentType,origin,status] of [['{','application/scim+json','https://slate.test',400],['text','text/plain','https://slate.test',415],['{}','application/scim+json','https://foreign.example',403]] as const){
    const result=await f.api.request('https://slate.test/scim/v2/Users',{method:'POST',headers:{authorization:`Bearer ${f.credential.secret}`,'content-type':contentType,origin},body},{...env,SLATE_PROFILE:undefined});
    expect(result.status).toBe(status);expect(result.headers.get('content-type')).toContain('application/scim+json');expect((await result.json<any>()).status).toBe(String(status));
  }
  const cookieOnly=await f.api.request('https://slate.test/scim/v2/Users',{headers:{cookie:f.cookies[f.owner]!}},{...env,SLATE_PROFILE:undefined});expect(cookieOnly.status).toBe(401);
  const pat=await f.mint();expect((await f.request('/Users','GET',undefined,pat.secret)).status).toBe(401);
  const tokenAdmin=await f.api.request('https://slate.test/api/developer/scim',{headers:{authorization:`Bearer ${pat.secret}`}},{...env,SLATE_PROFILE:undefined});expect(tokenAdmin.status).toBe(401);
  const metadata=await f.ok('/api/developer/scim');expect(JSON.stringify(metadata).includes(f.credential.secret)).toBe(false);expect(metadata.items[0]).not.toHaveProperty('token_hash');
  for(const id of [f.owner,f.guest]){
    const email=await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(id).first<string>('email');
    expect((await f.request('/Users','POST',user(email!))).status).toBe(403);
    expect((await f.request(`/Users/${id}`,'PATCH',patch({op:'replace',path:'active',value:false}))).status).toBe(404);
    expect((await f.request(`/Users/${id}`,'DELETE')).status).toBe(404);
  }
  expect(await env.DB.prepare("SELECT count(*) AS n FROM members WHERE workspace_id=? AND role='owner' AND status='active'").bind(f.workspaceId).first<number>('n')).toBe(1);
}
export async function credentialJourney(f:Awaited<ReturnType<typeof scimFixture>>) {
  const previous=f.credential.secret,rotated=await f.rotate();expect((await f.request('/Users','GET',undefined,previous)).status).toBe(401);expect((await f.request('/Users')).status).toBe(200);
  await f.ok(`/api/developer/scim/${rotated.value.id}/revoke`,'POST',{operationKey:createUlid()});expect((await f.request('/Users')).status).toBe(401);
  const fresh=await f.mintCredential();
  const another=(await seedMember(f.workspaceId,{role:'owner',email:'synthetic-slate-10@example.test',displayName:'Second owner'})).memberId;
  f.cookies[another]=await sessionFor(another,{freshProof:true});
  await f.ok(`/api/members/${f.owner}/role`,'PUT',{operationKey:createUlid(),expectedRole:'owner',role:'member'},{member:another});
  expect((await f.request('/Users','GET',undefined,fresh.secret)).status).toBe(401);
  expect(await env.DB.prepare('SELECT token_hash FROM scim_credentials WHERE id=?').bind(fresh.value.id).first<string|null>('token_hash')).toBeNull();
}
