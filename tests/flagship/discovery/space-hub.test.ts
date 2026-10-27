import {runFoldCases} from '../fold-cases';
import { env } from 'cloudflare:test';
import { beforeEach, expect, test } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { resetDeployment } from '../../e2e/setup/reset-deployment';
import { seedMember, sessionFor } from '../../e2e/setup/fixtures';
import { followingFixture } from './following-support';

beforeEach(resetDeployment);

async function publishing(f:Awaited<ReturnType<typeof followingFixture>>,mode:'always-live'|'draft-then-publish') {
  const workspace=await f.ok(f.owner,'GET','/api/workspace');
  const {name,mark,description,guestAccess,publicLinkAccess,anonymousAccess}=workspace;
  await f.ok(f.owner,'PUT','/api/workspace',{operationKey:f.key(),expectedRevisionId:workspace.revisionId,name,mark,description,guestAccess,publicLinkAccess,anonymousAccess,policies:{...workspace.policies,'page.lifecycle.v1':mode}});
}

test("CONT-011 — space homes and curated hubs retain revision and reader authority", async () => {
  await runFoldCases([
{name:"CONT-011 — a space opens its editable home with normal page authority and revision conflicts",before:async()=>{await resetDeployment();},run:async()=>{
try {

  const f=await followingFixture();
  const native=await f.ok(f.owner,'POST','/api/containers',{operationKey:f.key(),name:'Product',description:'How the product team works.',visibility:'private'});
  const fresh=await f.ok(f.owner,'GET',`/api/containers/${native.value.id}/home`);
  expect(fresh.pageId).toBe(native.value.homePageId);
  const document=await f.ok(f.owner,'GET',`/api/pages/${fresh.pageId}`);
  expect(document.permissions.canEdit).toBe(true);
  expect(document.blocks[0].content.text).toEqual([{text:'How the product team works.'}]);
  expect((await f.request(f.editor,'GET',`/api/containers/${native.value.id}/home`)).status).toBe(404);

  const existing=(await f.create('Team home')).value.pageId;
  const before=await f.ok(f.owner,'GET',`/api/containers/${f.containerId}/home`);
  const change={operationKey:f.key(),expectedRevisionId:before.revisionId,pageId:existing};
  expect((await f.request(f.editor,'PUT',`/api/containers/${f.containerId}/home`,change)).status).toBe(403);
  const saved=await f.ok(f.owner,'PUT',`/api/containers/${f.containerId}/home`,change);
  expect(await f.ok(f.owner,'PUT',`/api/containers/${f.containerId}/home`,change)).toEqual(saved);
  expect((await f.ok(f.editor,'GET',`/api/containers/${f.containerId}/home`)).pageId).toBe(existing);
  await f.edit(existing,'Team home revised',f.editor);
  expect((await f.ok(f.owner,'GET',`/api/pages/${existing}`)).page.title).toBe('Team home revised');
  expect((await f.request(f.owner,'PUT',`/api/containers/${f.containerId}/home`,{...change,operationKey:f.key()})).status).toBe(409);

  const current=await f.ok(f.owner,'GET',`/api/containers/${f.containerId}/home`);
  expect((await f.request(f.owner,'PUT',`/api/containers/${f.containerId}/home`,{operationKey:f.key(),expectedRevisionId:current.revisionId,pageId:null})).status).toBe(400);
  expect((await f.request(f.owner,'PUT',`/api/containers/${f.containerId}/home`,{operationKey:f.key(),expectedRevisionId:current.revisionId,pageId:fresh.pageId})).status).toBe(400);
  await publishing(f,'draft-then-publish');
  const draft=(await f.create('Private draft')).value.pageId;
  expect((await f.request(f.owner,'PUT',`/api/containers/${f.containerId}/home`,{operationKey:f.key(),expectedRevisionId:current.revisionId,pageId:draft})).status).toBe(400);

  // Restricting the chosen page removes even its ID from another reader's home response.
  await f.ok(f.owner,'POST','/api/sharing',{operationKey:f.key(),targetKind:'page',targetId:existing,principalKind:'member',principalId:f.owner,level:'full'});
  const latest=await f.ok(f.owner,'GET',`/api/pages/${existing}`);
  await f.ok(f.owner,'PUT',`/api/sharing/pages/${existing}/inheritance`,{operationKey:f.key(),expectedRevisionId:latest.page.revisionId,restricted:true});
  expect((await f.ok(f.editor,'GET',`/api/containers/${f.containerId}/home`)).pageId).toBeNull();
  expect((await f.ok(f.owner,'GET',`/api/containers/${f.containerId}/home`)).pageId).toBe(existing);
  const replacement=await f.ok(f.owner,'PUT',`/api/containers/${f.containerId}/home`,{operationKey:f.key(),expectedRevisionId:current.revisionId,create:true});
  expect(replacement.value.pageId).not.toBe(existing);
  expect((await f.ok(f.editor,'GET',`/api/pages/${replacement.value.pageId}`)).permissions.canEdit).toBe(true);

} finally {}
}},
{name:"CONT-011 — an owner curates a company hub for a new member, filtering private, unpublished and unverified content on every read",before:async()=>{await resetDeployment();},run:async()=>{
try {

  const f=await followingFixture();
  const guide=(await f.create('Getting started')).value.pageId;
  const keyPage=(await f.create('Escalation policy')).value.pageId;
  const privateSpace=(await f.ok(f.owner,'POST','/api/containers',{operationKey:f.key(),name:'Leadership',visibility:'private'})).value.id;
  const secret=(await f.ok(f.owner,'POST','/api/pages',{operationKey:f.key(),containerId:privateSpace,title:'Private board plan'})).value.pageId;
  const post=async(title:string,containerId=f.containerId)=>(await f.ok(f.owner,'POST',`/api/blog/containers/${containerId}/posts`,{operationKey:f.key(),title,body:'A company update.'})).value.pageId;
  const older=await post('Office update'),newer=await post('New teammate'),secretPost=await post('Private acquisition',privateSpace);
  await f.ok(f.owner,'POST','/api/status',{operationKey:f.key(),key:'verified',label:'Verified',color:'#228855',requiresVerification:true});
  const verify=async()=>{
    const doc=await f.ok(f.owner,'GET',`/api/pages/${keyPage}`);
    await f.ok(f.owner,'POST',`/api/pages/${keyPage}/open`,{operationKey:f.key(),revisionId:doc.workingRevisionId});
    await f.ok(f.owner,'POST',`/api/status/page/${keyPage}`,{operationKey:f.key(),expectedRevisionId:doc.page.revisionId,statusKey:'verified',attestRevisionId:doc.workingRevisionId});
  };
  await verify();

  const configuration={title:'Welcome to Harbor',description:'Start here for company knowledge.',linkPageIds:[guide,secret],announcementPageIds:[older,secretPost,newer],keyPageIds:[keyPage]};
  const input={operationKey:f.key(),expectedRevisionId:null,configuration};
  expect((await f.request(f.editor,'PUT','/api/hub',input)).status).toBe(403);
  expect((await f.request(f.editor,'GET','/api/hub/configuration')).status).toBe(403);
  expect((await f.request(f.editor,'GET','/api/hub/pages')).status).toBe(403);
  const saved=await f.ok(f.owner,'PUT','/api/hub',input);
  expect(await f.ok(f.owner,'PUT','/api/hub',input)).toEqual(saved);
  expect((await f.request(f.owner,'PUT','/api/hub',{...input,operationKey:f.key()})).status).toBe(409);

  // Seed only identity/session: this person has never opened a page or followed a space.
  const {memberId}=await seedMember(f.workspaceId,{role:'member',email:'new-person@example.test',displayName:'New person'});
  const cookie=await sessionFor(memberId),api=createApi();
  const read=async()=>{
    const response=await api.request('https://slate.test/api/hub',{headers:{cookie}},env);
    expect(response.status).toBe(200);return response.json<any>();
  };
  expect((await read()).title).toBe(configuration.title);
  expect((await read()).links).toEqual([]);
  const grants=new Map<string,string>();
  for (const pageId of [guide,keyPage,older,newer]) {
    const result=await f.ok(f.owner,'POST','/api/sharing',{operationKey:f.key(),targetKind:'page',targetId:pageId,principalKind:'member',principalId:memberId,level:'view'});
    grants.set(pageId,result.value.id);
  }
  const hub=await read();
  expect(hub.canManage).toBe(false);
  expect(hub.links.map((page:any)=>page.id)).toEqual([guide]);
  expect(hub.keyPages.map((page:any)=>page.id)).toEqual([keyPage]);
  expect(hub.announcements.map((page:any)=>page.pageId)).toEqual([newer,older]);
  expect(JSON.stringify(hub)).not.toContain(secret);expect(JSON.stringify(hub)).not.toContain(secretPost);
  expect(JSON.stringify(hub)).not.toContain('Private board plan');expect(JSON.stringify(hub)).not.toContain('Private acquisition');

  // A reader receives the published title, never an owner's unpublished rename.
  await publishing(f,'draft-then-publish');
  await f.edit(guide,'Unpublished company rename');
  expect((await read()).links[0].title).toBe('Getting started');
  await f.edit(keyPage,'Changed escalation policy');
  expect((await read()).keyPages).toEqual([]);
  await verify();
  // Re-verifying unpublished work does not label an older delivered revision as current.
  expect((await read()).keyPages).toEqual([]);
  const revised=await f.ok(f.owner,'GET',`/api/pages/${keyPage}`);
  await f.ok(f.owner,'POST',`/api/pages/${keyPage}/publish`,{operationKey:f.key(),expectedRevisionId:revised.page.revisionId});
  await verify();
  expect((await read()).keyPages.map((page:any)=>page.id)).toEqual([keyPage]);
  await env.DB.prepare("UPDATE page_verifications SET expires_at='2000-01-01T00:00:00.000Z' WHERE page_id=?").bind(keyPage).run();
  expect((await read()).keyPages).toEqual([]);

  await f.ok(f.owner,'POST','/api/sharing',{operationKey:f.key(),targetKind:'page',targetId:guide,id:grants.get(guide),principalKind:'member',principalId:memberId,level:'view',revoke:true});
  expect((await read()).links).toEqual([]);
  const draft=(await f.create('Draft hub page')).value.pageId;
  expect((await f.request(f.owner,'PUT','/api/hub',{operationKey:f.key(),expectedRevisionId:saved.value.revisionId,configuration:{...configuration,linkPageIds:[draft]}})).status).toBe(400);
  expect((await f.request(f.owner,'PUT','/api/hub',{operationKey:f.key(),expectedRevisionId:saved.value.revisionId,configuration:{...configuration,announcementPageIds:[guide]}})).status).toBe(400);

} finally {}
}}
  ]);
});
