import { expect,test } from 'vitest';
import { fixture,env,createUlid } from './fixture';

test('SHARE-001/003/005/008 local: effective provenance follows inheritance, restrictions, expiry and current authority',async()=>{
  const f=await fixture(),parent=await f.page('Parent title'),child=await f.page('Child title',parent.id);
  const grant=await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:parent.id,principalKind:'member',principalId:f.readerId,level:'comment'});
  expect(grant.status).toBe(200);
  const list=await f.request('GET',`/api/sharing/pages/${child.id}`);
  expect(list.status).toBe(200);
  expect(list.data.inheritedItems.find((g:any)=>g.id===grant.data.value.id)).toMatchObject({principalLabel:'Core reader',level:'comment',inherited:true,status:'active',effective:true,origin:{kind:'page',id:parent.id,name:'Parent title'}});
  expect(list.data.container).toEqual({id:f.containerId,name:'Core team'});
  expect(list.data.levels).toEqual(['full','edit','comment','view']);
  expect((await f.request('GET',`/api/pages/${child.id}`,undefined,f.readerId)).status).toBe(200);
  await env.DB.prepare("UPDATE pages SET access_inheritance='restricted' WHERE id=?").bind(child.id).run();
  // Give only the owner a direct full grant so the sharing panel remains authorized.
  await env.DB.prepare("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(?,?,'member',?,'full',?,?)").bind(createUlid(),child.id,f.ownerId,f.ctx.now,f.ctx.now).run();
  const restricted=await f.request('GET',`/api/sharing/pages/${child.id}`);
  expect(restricted.data.inheritedItems).toEqual([]);
  expect((await f.request('GET',`/api/pages/${child.id}`,undefined,f.readerId)).status).toBe(404);
  const expired=await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:child.id,principalKind:'member',principalId:f.readerId,level:'view',expiresAt:'2000-01-01T00:00:00.000Z'});
  expect(expired.status).toBe(200);
  expect((await f.request('GET',`/api/sharing/pages/${child.id}`)).data.items.find((g:any)=>g.id===expired.data.value.id)).toMatchObject({status:'expired',effective:false});
  const configured=await f.request('PUT','/api/sharing/configuration',{operationKey:createUlid(),expectedRevisionId:null,levels:['full','edit','view']});
  expect(configured.status).toBe(200);
  expect((await f.request('GET',`/api/sharing/pages/${parent.id}`)).data.levels).toEqual(['full','edit','view']);
  expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:parent.id,principalKind:'member',principalId:f.readerId,level:'comment'})).status).toBe(400);
  expect((await f.request('PUT','/api/sharing/configuration',{operationKey:createUlid(),expectedRevisionId:configured.data.value.revisionId,levels:['view']},f.readerId)).status).toBe(403);
  expect((await f.request('GET',`/api/sharing/pages/${parent.id}`,undefined,f.readerId)).status).toBe(404);
});

test('NAV-001/003/004 local: favourites preserve database destinations and personal order; workspace configuration is owner-only and CAS protected',async()=>{
  const f=await fixture(),page=await f.page('Favourite');
  const db=await f.request('POST','/api/databases',{operationKey:createUlid(),containerId:f.containerId,title:'Database destination'});
  expect(db.status).toBe(201);
  for(const [kind,id,position] of [['page',page.id,2],['container',f.containerId,1],['database',db.data.value.id,0]] as const)expect((await f.request('PUT','/api/navigation/favourites',{operationKey:createUlid(),kind,id,enabled:true,position})).status).toBe(200);
  const navigation=await f.request('GET','/api/navigation');
  expect(navigation.data.favourites.map((x:any)=>x.kind)).toEqual(['database','container','page']);
  expect(navigation.data.favourites[0]).toMatchObject({id:db.data.value.id,pageId:db.data.value.pageId,href:`/app/databases/${db.data.value.id}`});
  expect((await f.request('GET','/api/navigation',undefined,f.readerId)).data.favourites).toEqual([]);
  const value={sidebarCollapsed:true,collapsedContainers:[f.containerId],timezone:'Australia/Brisbane',quietRoutine:true,destinationOrder:['search','home']};
  const saved=await f.request('PUT','/api/navigation/preferences',{operationKey:createUlid(),expectedRevisionId:null,value});
  expect(saved.status).toBe(200);
  expect((await f.request('GET','/api/navigation/preferences')).data.value.destinationOrder).toEqual(['search','home']);
  const {destinationOrder,...oldValue}=value;
  expect((await f.request('PUT','/api/navigation/preferences',{operationKey:createUlid(),expectedRevisionId:saved.data.value.revisionId,value:oldValue})).status).toBe(200);
  expect((await f.request('GET','/api/navigation/preferences')).data.value.destinationOrder).toEqual(destinationOrder);
  const destinations=[{id:'search',label:'Find',href:'/app/search',visible:true},{id:'home',label:'Home',href:'/app',visible:false}];
  const configuration=await f.request('PUT','/api/navigation/configuration',{operationKey:createUlid(),expectedRevisionId:null,destinations});
  expect(configuration.status).toBe(200);
  expect((await f.request('GET','/api/navigation',undefined,f.readerId)).data.configuration.destinations).toEqual(destinations);
  expect((await f.request('PUT','/api/navigation/configuration',{operationKey:createUlid(),expectedRevisionId:null,destinations})).status).toBe(409);
  expect((await f.request('PUT','/api/navigation/configuration',{operationKey:createUlid(),expectedRevisionId:configuration.data.value.revisionId,destinations},f.readerId)).status).toBe(403);
  expect((await f.request('PUT','/api/navigation/favourites',{operationKey:createUlid(),kind:'database',id:db.data.value.id,enabled:false})).status).toBe(200);
  expect((await f.request('GET','/api/navigation')).data.favourites).toHaveLength(2);
});

test('NAV-004/SHARE-005 local: simultaneous first configuration writes have one winner and sequence remains authoritative after clock skew',async()=>{
  const f=await fixture();
  const results=await Promise.all([['full','view'],['full','edit']].map(levels=>f.request('PUT','/api/sharing/configuration',{operationKey:createUlid(),expectedRevisionId:null,levels})));
  expect(results.map(result=>result.status).sort()).toEqual([200,409]);
  const winner=results.find(result=>result.status===200)!;
  expect((await f.request('GET','/api/sharing/configuration')).data).toEqual(winner.data.value);
  const {setSharingConfiguration}=await import('../../../src/core/features/sharing/configuration');
  const later=await setSharingConfiguration({...f.ctx,authorizationEpoch:undefined,now:'2000-01-01T00:00:00.000Z'},{operationKey:createUlid(),expectedRevisionId:winner.data.value.revisionId,levels:['full']});
  expect((await f.request('GET','/api/sharing/configuration')).data).toEqual(later.value);
  const rows=(await env.DB.prepare("SELECT content_json FROM core_entity_revisions WHERE workspace_id=? AND entity_kind='sharing-configuration'").bind(f.workspaceId).all<{content_json:string}>()).results;
  expect(rows.map(row=>JSON.parse(row.content_json).configurationSequence).sort()).toEqual([1,2]);
});

test('SHARE-003 local: authorized restriction and restore use CAS, retain direct grants, affect descendants and copy no inherited grants',async()=>{
  const f=await fixture(),parent=await f.page('Restrict parent'),child=await f.page('Descendant',parent.id);
  for(const [targetId,principalId,level] of [[parent.id,f.ownerId,'full'],[parent.id,f.readerId,'comment']] as const)expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId,principalKind:'member',principalId,level})).status).toBe(200);
  // The reader inherits from the parent; restricting the child must remove that access.
  expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:child.id,principalKind:'member',principalId:f.ownerId,level:'full'})).status).toBe(200);
  const grantsBefore=(await env.DB.prepare('SELECT * FROM page_grants WHERE page_id=? ORDER BY id').bind(child.id).all()).results;
  const restricted=await f.request('PUT',`/api/sharing/pages/${child.id}/inheritance`,{operationKey:createUlid(),expectedRevisionId:child.revisionId,restricted:true});
  expect(restricted.status).toBe(200);
  expect((await f.request('GET',`/api/pages/${child.id}`,undefined,f.readerId)).status).toBe(404);
  expect((await f.request('PUT',`/api/sharing/pages/${child.id}/inheritance`,{operationKey:createUlid(),expectedRevisionId:child.revisionId,restricted:false})).status).toBe(409);
  expect((await f.request('PUT',`/api/sharing/pages/${parent.id}/inheritance`,{operationKey:createUlid(),expectedRevisionId:parent.revisionId,restricted:true},f.readerId)).status).toBe(404);
  const restored=await f.request('PUT',`/api/sharing/pages/${child.id}/inheritance`,{operationKey:createUlid(),expectedRevisionId:restricted.data.value.revisionId,restricted:false});
  expect(restored.status).toBe(200);
  expect((await f.request('GET',`/api/pages/${child.id}`,undefined,f.readerId)).status).toBe(200);
  expect((await env.DB.prepare('SELECT * FROM page_grants WHERE page_id=? ORDER BY id').bind(child.id).all()).results).toEqual(grantsBefore);
  expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM activity_entries WHERE target_id=? AND action='sharing.inheritance'").bind(child.id).first<{count:number}>())!.count).toBe(2);
});
