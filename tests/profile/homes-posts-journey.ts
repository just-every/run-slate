import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {seedMember,sessionFor} from '../e2e/setup/fixtures';

export async function homesPostsJourney(api:ReturnType<typeof createApi>,containerId:string,workspaceId:string,cookie:string){
 const follower=await seedMember(workspaceId,{displayName:'Operations follower',role:'member',email:crypto.randomUUID()+'@test.invalid'}),followerCookie=await sessionFor(follower.memberId);
 const request=(path:string,method='GET',body?:unknown,as=cookie)=>api.request('https://slate.example'+path,{method,headers:{cookie:as,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},env);
 async function command(path:string,body:Record<string,unknown>,method='POST',as=cookie){
  const response=await request(path,method,{operationKey:crypto.randomUUID(),...body},as);
  expect(response.status,await response.clone().text()).toBe(200);return response.json<any>();
 }
 const read=async(id:string,as=cookie)=>(await request('/api/pages/'+id,'GET',undefined,as)).json<any>();
 async function publish(id:string,generalAccess?:unknown){
  const page=await read(id),preview=await command(`/api/pages/${id}/publish-preview`,{expectedRevisionId:page.page.revisionId,...(generalAccess?{generalAccess}:{})});
  await command(`/api/pages/${id}/publish`,{expectedRevisionId:page.page.revisionId,previewFingerprint:preview.previewFingerprint,...(generalAccess?{generalAccess}:{})});
 }
 await command('/api/sharing',{targetKind:'container',targetId:containerId,principalKind:'member',principalId:follower.memberId,level:'view'});
 const watched=await command('/api/navigation/container-watches',{containerId,enabled:true},'PUT',followerCookie);expect(watched.value.enabled).toBe(true);
 const post=(await command('/api/posts',{containerId,title:'Operations release announcement'})).value.pageId;
 expect((await (await request(`/api/posts?containerId=${containerId}`)).json<any>()).items.some((item:any)=>item.id===post)).toBe(false);
 await publish(post);
 const published=await read(post),metadata=published.properties.post;
 expect(metadata.publishedAt).toBeTruthy();expect(metadata.authorMemberId).toBe(published.authorMemberId);
 let following=(await (await request('/api/posts?following=true','GET',undefined,followerCookie)).json<any>()).items;
 expect(following.find((item:any)=>item.id===post)).toMatchObject({title:'Operations release announcement',publishedAt:metadata.publishedAt});
 const notices=(await (await request('/api/notifications','GET',undefined,followerCookie)).json<any>()).items;
 expect(notices.filter((item:any)=>item.pageId===post&&item.event==='published')).toHaveLength(1);
 const {id:_workspaceId,revisionId:workspaceRevision,...settings}=await (await request('/api/workspace')).json<any>();
 await command('/api/workspace',{...settings,expectedRevisionId:workspaceRevision,policies:{...settings.policies,'page.lifecycle.v1':'draft-then-publish'}},'PUT');
 await command(`/api/pages/${post}`,{expectedRevisionId:published.page.revisionId,properties:{title:'Unpublished announcement changes'}},'PATCH');
 following=(await (await request('/api/posts?following=true','GET',undefined,followerCookie)).json<any>()).items;
 expect(following.find((item:any)=>item.id===post)?.title).toBe('Operations release announcement');
 expect((await read(post)).properties.post).toEqual(metadata);

 const hub=(await command('/api/pages',{containerId,title:'Operations team hub'})).value.pageId;
 await publish(hub,{kind:'workspace',level:'view'});
 const privateSpace=(await command('/api/containers',{name:'Restricted release plans',visibility:'private'})).value.id;
 const hidden=(await command('/api/pages',{containerId:privateSpace,title:'Restricted incident plan'})).value.pageId;await publish(hidden);
 const shared=(await command('/api/pages',{containerId,title:'Release handover links'})).value.pageId;await publish(shared);
 const saved=await command('/api/homes/company-hub',{expectedRevisionId:null,pageId:hub,linkPageIds:[shared,hidden],keyPageIds:[]},'PUT');
 expect(saved.value.pageId).toBe(hub);
 const ownerHub=await (await request('/api/homes/company-hub')).json<any>();expect(ownerHub.links.map((item:any)=>item.id)).toEqual([shared,hidden]);
 const readerHub=await (await request('/api/homes/company-hub','GET',undefined,followerCookie)).json<any>();
 expect(readerHub.state).toBe('ready');expect(readerHub.links.map((item:any)=>item.id)).toEqual([shared]);expect(readerHub.configuration).toBeUndefined();expect(JSON.stringify(readerHub)).not.toContain(hidden);expect(JSON.stringify(readerHub)).not.toContain('Restricted incident plan');
 const intruder=(await request('/api/homes/company-hub','PUT',{operationKey:crypto.randomUUID(),expectedRevisionId:saved.value.revisionId,pageId:hidden,linkPageIds:[],keyPageIds:[]},followerCookie));expect(intruder.status).toBe(403);
 const containerHome=await (await request(`/api/homes/containers/${containerId}`)).json<any>();
 await command(`/api/homes/containers/${containerId}`,{expectedRevisionId:containerHome.configuration.revisionId,pageId:hub},'PUT');
 expect((await (await request(`/api/homes/containers/${containerId}`)).json<any>()).page.id).toBe(hub);
 const stale=await request(`/api/homes/containers/${containerId}`,'PUT',{operationKey:crypto.randomUUID(),expectedRevisionId:containerHome.configuration.revisionId,pageId:shared});expect(stale.status).toBe(409);
 // An actual new member receives the selected hub without any per-person grant.
 const newcomer=await seedMember(workspaceId,{displayName:'New operations member',role:'member',email:crypto.randomUUID()+'@test.invalid'});
 expect((await (await request('/api/homes/company-hub','GET',undefined,await sessionFor(newcomer.memberId))).json<any>()).page.id).toBe(hub);
}
