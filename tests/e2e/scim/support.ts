import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { apiFixture } from '../public-api/support';
import { createUlid } from '../../../src/core/shared/ulid';
import { captureMail } from '../helpers/mail-edge';
export const USER='urn:ietf:params:scim:schemas:core:2.0:User';
export const GROUP='urn:ietf:params:scim:schemas:core:2.0:Group';
export const PATCH='urn:ietf:params:scim:api:messages:2.0:PatchOp';
export async function scimFixture() {
  const f=await apiFixture(),mail=captureMail();
  const mintCredential=()=>f.ok('/api/developer/scim','POST',{operationKey:createUlid(),name:'Synthetic directory'});
  const initial={operationKey:createUlid(),name:'Synthetic directory'};
  let credential=await f.ok('/api/developer/scim','POST',initial);
  const replayed=await f.ok('/api/developer/scim','POST',initial);expect(replayed.value).toEqual(credential.value);expect(replayed).not.toHaveProperty('secret');
  const request=async(path:string,method='GET',body?:unknown,token:string|undefined=credential.secret,key?:string)=>{
    const response=await f.api.request('https://slate.test/scim/v2'+path,{method,headers:{'content-type':'application/scim+json',...(token?{authorization:`Bearer ${token}`} : {}),...(key?{'idempotency-key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})},{...env,SLATE_PROFILE:undefined});
    return {status:response.status,headers:response.headers,data:response.status===204?null:await response.json<any>()};
  };
  const ok=async(path:string,method='GET',body?:unknown,status=200,key?:string)=>{const response=await request(path,method,body,credential.secret,key);expect(response.status,JSON.stringify(response.data)).toBe(status);if(status!==204)expect(response.headers.get('content-type')).toContain('application/scim+json');return response.data;};
  const accept=async(email:string)=>{
    const link=mail.latestLink(email),token=link.searchParams.get('token')!;
    const before=await env.DB.prepare("SELECT id FROM members WHERE workspace_id=? AND email=? AND status='active'").bind(f.workspaceId,email).first();
    const preview=await f.api.request(link.toString(),{method:'GET'},{...env,SLATE_PROFILE:undefined});expect(preview.status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM members WHERE workspace_id=? AND email=? AND status='active'").bind(f.workspaceId,email).first()).toEqual(before);
    const accepted=await f.api.request('https://slate.test/api/auth/invitation/accept',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})},{...env,SLATE_PROFILE:undefined});
    expect(accepted.status).toBe(303);
    const memberId=await env.DB.prepare('SELECT id FROM members WHERE workspace_id=? AND email=?').bind(f.workspaceId,email).first<string>('id');expect(memberId).toBeTruthy();
    return {memberId:memberId!,cookie:accepted.headers.get('set-cookie')!.split(';')[0]!};
  };
  return {...f,mail,credential,request,scim:ok,accept,mintCredential,rotate:async()=>{credential=await f.ok(`/api/developer/scim/${credential.value.id}/rotate`,'POST',{operationKey:createUlid(),name:'Synthetic rotated directory'});return credential;}};
}
export const patch=(...Operations:unknown[])=>({schemas:[PATCH],Operations});
export const user=(userName:string,extra:Record<string,unknown>={})=>({schemas:[USER],userName,displayName:'Synthetic Person',active:true,...extra});
