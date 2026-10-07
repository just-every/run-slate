import { expect,test } from 'vitest';
import { fixture,env,createUlid } from './fixture';

test('LINK-004/NOTIF-001 local: content-free access request durably notifies one current full grantor once, never grants or exposes a title, and respects subsequent revocation',async()=>{
  const f=await fixture(),page=await f.page('Hidden secret title');
  const endpoint=`/api/sharing/pages/${page.id}/request-access`,input={operationKey:createUlid()};
  const grants=(await env.DB.prepare('SELECT * FROM page_grants WHERE page_id=?').bind(page.id).all()).results;
  const results=await Promise.all([input,input,{operationKey:createUlid()}].map(body=>f.request('POST',endpoint,body,f.readerId)));
  for(const result of results)expect(result).toEqual({status:202,data:{accepted:true}});
  expect((await f.request('GET',`/api/pages/${page.id}`,undefined,f.readerId)).status).toBe(404);
  expect((await env.DB.prepare('SELECT * FROM page_grants WHERE page_id=?').bind(page.id).all()).results).toEqual(grants);
  const notices=(await f.request('GET','/api/notifications')).data.items.filter((item:any)=>item.event==='access-requested');
  expect(notices).toHaveLength(1);expect(notices[0]).toMatchObject({pageId:page.id,title:'Hidden secret title',detail:{requesterMemberId:f.readerId},href:`/app/pages/${page.id}`});
  expect((await f.request('GET','/api/notifications',undefined,f.readerId)).data.items).toEqual([]);
  expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE page_id=? AND event='access-requested'").bind(page.id).first<{count:number}>())!.count).toBe(1);
  // A retained request is visible only while its recipient may still grant access.
  await env.DB.prepare("UPDATE container_grants SET level='view' WHERE container_id=? AND principal_id=?").bind(f.containerId,f.ownerId).run();
  expect((await f.request('GET','/api/notifications')).data.items.filter((item:any)=>item.event==='access-requested')).toEqual([]);
});

test('LINK-004/SHARE-002 local: missing, foreign, private, deleted, already-readable and guest-veto targets return identical content-free responses without actionable notices',async()=>{
  const f=await fixture(),foreign=await fixture(),foreignPage=await foreign.page('Foreign secret'),deleted=await f.page('Deleted secret'),readable=await f.page('Already readable');
  await env.DB.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(f.ctx.now,deleted.id).run();
  expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:readable.id,principalKind:'member',principalId:f.readerId,level:'view'})).status).toBe(200);
  await f.request('GET','/api/members/current');
  const personal=await env.DB.prepare('SELECT id FROM containers WHERE workspace_id=? AND key=?').bind(f.workspaceId,`personal:${f.ownerId}`).first<{id:string}>();
  const personalPage=await f.request('POST','/api/pages',{operationKey:createUlid(),containerId:personal!.id,title:'Personal secret'});expect(personalPage.status).toBe(200);
  for(const id of ['missing-page',foreignPage.id,deleted.id,readable.id,personalPage.data.value.pageId])expect(await f.request('POST',`/api/sharing/pages/${id}/request-access`,{operationKey:createUlid()},f.readerId)).toEqual({status:202,data:{accepted:true}});
  const denied=await f.page('Vetoed secret');
  await env.DB.prepare("UPDATE members SET member_kind='guest' WHERE id=?").bind(f.readerId).run();
  await env.DB.prepare("UPDATE containers SET guest_access='forbidden' WHERE id=?").bind(f.containerId).run();
  expect(await f.request('POST',`/api/sharing/pages/${denied.id}/request-access`,{operationKey:createUlid()},f.readerId)).toEqual({status:202,data:{accepted:true}});
  expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE workspace_id=? AND event='access-requested'").bind(f.workspaceId).first<{count:number}>())!.count).toBe(0);
});

test('LINK-004/SAVE-005 local: request operation keys bind their target and daily actor rate limiting covers nonexistent IDs too; unauthenticated requests fail',async()=>{
  const f=await fixture(),input={operationKey:createUlid()},endpoint='/api/sharing/pages/nonexistent/request-access';
  expect((await f.request('POST',endpoint,input,'no-session')).status).toBe(401);
  expect((await f.request('POST',endpoint,{...input,ownerId:f.ownerId},f.readerId)).status).toBe(400);
  expect((await f.request('POST',endpoint,input,f.readerId)).status).toBe(202);
  expect((await f.request('POST','/api/sharing/pages/different/request-access',input,f.readerId)).status).toBe(409);
  for(let n=1;n<20;n++)expect((await f.request('POST',endpoint,{operationKey:createUlid()},f.readerId)).status).toBe(202);
  expect((await f.request('POST',endpoint,{operationKey:createUlid()},f.readerId)).status).toBe(429);
  expect((await f.request('POST',endpoint,input,f.readerId)).status).toBe(202);
  expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM discovery_revisions WHERE member_id=? AND entity_kind='access-request'").bind(f.readerId).first<{count:number}>())!.count).toBe(20);
});
