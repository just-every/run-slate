import { expect,test } from 'vitest';
import { fixture,env,createUlid } from './fixture';
import { seedWorkspace,seedMember,sessionFor } from '../../e2e/setup/fixtures';
import { createApi } from '../../../src/core/app/hono';

test('WORK-001/008/011/012 local: identity CAS is owner-only, settings do not change container identity, and all themes persist independently across sessions',async()=>{
  const f=await fixture();
  const workspace=(await f.request('GET','/api/workspace')).data;
  const settings={operationKey:createUlid(),expectedRevisionId:workspace.revisionId,name:'Changed workspace',mark:'🌲',description:'Local qualification',guestAccess:workspace.guestAccess,publicLinkAccess:workspace.publicLinkAccess,anonymousAccess:workspace.anonymousAccess,policies:workspace.policies};
  expect((await f.request('PUT','/api/workspace',settings,f.readerId)).status).toBe(403);
  const changed=await f.request('PUT','/api/workspace',settings);expect(changed.status).toBe(200);
  expect((await f.request('GET','/api/workspace',undefined,f.readerId)).data).toMatchObject({id:f.workspaceId,name:settings.name,mark:settings.mark,description:settings.description,revisionId:changed.data.value.revisionId});
  expect((await f.request('PUT','/api/workspace',{...settings,operationKey:createUlid()})).status).toBe(409);
  expect((await env.DB.prepare('SELECT name FROM containers WHERE id=?').bind(f.containerId).first<{name:string}>())!.name).toBe('Core team');
  expect((await f.request('POST','/api/workspace',{operationKey:createUlid(),name:'Forbidden second workspace'})).status).toBe(404);
  const cookie=await sessionFor(f.readerId);
  for(const theme of ['dark','light','system']) {
    expect((await f.request('PUT','/api/members/current/theme',{operationKey:createUlid(),theme},f.readerId)).status).toBe(200);
    const response=await f.api.request('http://localhost:8787/api/members/current',{headers:{cookie}},env);
    expect(response.status).toBe(200);expect((await response.json<any>()).theme).toBe(theme);
    expect((await f.request('GET','/api/members/current')).data.theme).toBe('system');
  }
});

test('WORK-003/007/008/009 local: native group change removes inherited access, deletion retains individual grants, role and removal enforce setup and final owner guards',async()=>{
  const f=await fixture(),page=await f.page('Group target');
  const created=await f.request('POST','/api/groups',{operationKey:createUlid(),name:'Editors',memberIds:[f.readerId]});expect(created.status).toBe(200);const group=created.data.value;
  expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:page.id,principalKind:'group',principalId:group.id,level:'edit'})).status).toBe(200);
  expect((await f.request('GET',`/api/pages/${page.id}`,undefined,f.readerId)).data.permissions.canEdit).toBe(true);
  const removed=await f.request('POST','/api/groups',{operationKey:createUlid(),id:group.id,expectedRevisionId:group.revisionId,name:'Editors',memberIds:[]});expect(removed.status).toBe(200);
  expect((await f.request('GET',`/api/pages/${page.id}`,undefined,f.readerId)).status).toBe(404);
  const direct=await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:page.id,principalKind:'member',principalId:f.readerId,level:'view'});expect(direct.status).toBe(200);
  expect((await f.request('POST','/api/groups',{operationKey:createUlid(),id:group.id,expectedRevisionId:removed.data.value.revisionId,name:'Editors',memberIds:[],remove:true})).status).toBe(200);
  expect((await f.request('GET',`/api/pages/${page.id}`,undefined,f.readerId)).status).toBe(200);
  expect(await env.DB.prepare('SELECT id FROM page_grants WHERE id=?').bind(direct.data.value.id).first()).not.toBeNull();
  expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM activity_entries WHERE target_id=? AND action='group.save'").bind(group.id).first<{count:number}>())!.count).toBe(2);
  expect((await f.request('POST','/api/members/remove',{operationKey:createUlid(),memberId:f.ownerId})).status).toBe(409);
  expect((await f.request('POST','/api/members/remove',{operationKey:createUlid(),memberId:f.ownerId},f.readerId)).status).toBe(403);
  expect((await f.request('PUT',`/api/members/${f.readerId}/role`,{operationKey:createUlid(),expectedRole:'member',role:'owner'})).status).toBe(200);
  expect((await f.request('POST','/api/members/remove',{operationKey:createUlid(),memberId:f.ownerId},f.readerId)).status).toBe(403);
  expect((await f.request('PUT',`/api/members/${f.readerId}/role`,{operationKey:createUlid(),expectedRole:'owner',role:'member'})).status).toBe(200);
  await f.request('GET','/api/members/current',undefined,f.readerId);
  const personal=await env.DB.prepare("SELECT id FROM containers WHERE workspace_id=? AND key=?").bind(f.workspaceId,`personal:${f.readerId}`).first<{id:string}>();expect(personal).not.toBeNull();
  const ownPage=await f.request('POST','/api/pages',{operationKey:createUlid(),containerId:personal!.id,title:'Personal retained'},f.readerId);expect(ownPage.status).toBe(200);
  expect((await f.request('POST','/api/members/remove',{operationKey:createUlid(),memberId:f.readerId})).status).toBe(200);
  expect((await f.request('GET',`/api/pages/${page.id}`,undefined,f.readerId)).status).toBe(401);
  expect(await env.DB.prepare('SELECT id FROM page_grants WHERE id=?').bind(direct.data.value.id).first()).toBeNull();
  expect(await env.DB.prepare('SELECT owner_member_id,archived_at FROM pages WHERE id=?').bind(ownPage.data.value.pageId).first()).toMatchObject({owner_member_id:null,archived_at:expect.any(String)});
  expect((await f.request('GET',`/api/pages/${ownPage.data.value.pageId}`)).status).toBe(404);
});

test('WORK-001/013 local: first-run native command creates only its container/page once and remains absent for later members',async()=>{
  const {workspaceId}=await seedWorkspace();
  const {memberId}=await seedMember(workspaceId,{email:`first-${workspaceId}@test.invalid`,displayName:'First owner',role:'owner',isSetupOwner:true});
  const {memberId:later}=await seedMember(workspaceId,{email:`later-${workspaceId}@test.invalid`,displayName:'Later member',role:'member'});
  const api=createApi(),cookie=await sessionFor(memberId),laterCookie=await sessionFor(later);
  const request=async(method:string,path:string,body?:unknown,actorCookie=cookie)=>{const response=await api.request(`http://localhost:8787${path}`,{method,headers:{cookie:actorCookie,'content-type':'application/json'},body:body?JSON.stringify(body):undefined},env);return {status:response.status,data:await response.json<any>()};};
  expect((await request('GET','/api/workspace/first-run')).data).toEqual({required:true,canComplete:true});
  expect((await request('GET','/api/workspace/first-run',undefined,laterCookie)).data).toEqual({required:false,canComplete:false});
  const input={operationKey:createUlid(),workspaceName:'First workspace',containerName:'First container',pageTitle:'First page'};
  const created=await request('POST','/api/workspace/first-run',input);expect(created.status).toBe(200);
  expect((await request('POST','/api/workspace/first-run',input)).data).toEqual(created.data);
  expect((await request('POST','/api/workspace/first-run',{...input,operationKey:createUlid()})).status).toBe(409);
  expect((await request('GET','/api/workspace/first-run')).data).toEqual({required:false,canComplete:false});
  expect((await env.DB.prepare('SELECT id FROM containers WHERE workspace_id=?').bind(workspaceId).all()).results).toEqual([{id:created.data.value.containerId}]);
  expect((await env.DB.prepare('SELECT id FROM pages WHERE workspace_id=?').bind(workspaceId).all()).results).toEqual([{id:created.data.value.pageId}]);
  expect((await request('GET',`/api/pages/${created.data.value.pageId}`)).data.page.title).toBe('First page');
});
