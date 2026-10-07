import { test,expect } from 'vitest';
import { fixture,env,createUlid } from './fixture';

test('PAGE-007/LINK-004 local: reader details resolve owner and only current-authorized, published backlinks without member-directory access',async()=>{
  const f=await fixture(),target=await f.page('Target');
  await env.DB.prepare("UPDATE members SET member_kind='guest' WHERE id=?").bind(f.readerId).run();
  const source=async(title:string)=>f.request('POST','/api/pages',{operationKey:createUlid(),containerId:f.containerId,title,blocks:[{id:createUlid(),blockType:'paragraph',treePosition:'1',content:{text:[{text:'Target',mention:{kind:'page',id:target.id}}]}}]});
  const readable=await source('Published backlink'),hidden=await source('Hidden backlink');
  expect(readable.status).toBe(200);expect(hidden.status).toBe(200);
  for(const id of [target.id,readable.data.value.pageId])expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:id,principalKind:'member',principalId:f.readerId,level:'view'})).status).toBe(200);
  expect((await f.request('GET','/api/members',undefined,f.readerId)).status).toBe(403);
  const details=await f.request('GET',`/api/pages/${target.id}/details`,undefined,f.readerId);
  expect(details.status).toBe(200);expect(details.data.owner).toEqual({id:f.ownerId,displayName:'Core owner'});
  expect(details.data.linkedFrom).toEqual([{id:readable.data.value.pageId,title:'Published backlink'}]);
  const workspace=(await f.request('GET','/api/workspace')).data;
  expect((await f.request('PUT','/api/workspace',{operationKey:createUlid(),expectedRevisionId:workspace.revisionId,name:workspace.name,mark:workspace.mark,description:workspace.description,guestAccess:workspace.guestAccess,publicLinkAccess:workspace.publicLinkAccess,anonymousAccess:workspace.anonymousAccess,policies:{...workspace.policies,'page.lifecycle.v1':'draft-then-publish'}})).status).toBe(200);
  const changed=await f.request('PATCH',`/api/pages/${readable.data.value.pageId}`,{operationKey:createUlid(),expectedRevisionId:readable.data.value.revisionId,properties:{title:'Unpublished private name'}});
  expect(changed.status).toBe(200);
  expect((await f.request('GET',`/api/pages/${target.id}/details`,undefined,f.readerId)).data.linkedFrom).toEqual([{id:readable.data.value.pageId,title:'Published backlink'}]);
  await env.DB.prepare('UPDATE page_grants SET revoked_at=? WHERE page_id=? AND principal_id=?').bind(new Date().toISOString(),readable.data.value.pageId,f.readerId).run();
  expect((await f.request('GET',`/api/pages/${target.id}/details`,undefined,f.readerId)).data.linkedFrom).toEqual([]);
  expect((await f.request('GET',`/api/pages/${hidden.data.value.pageId}/details`,undefined,f.readerId)).status).toBe(404);
});

test('LINK-003/004 local: page mentions retain authorized archive, trash and content-free deletion states, never inaccessible metadata',async()=>{
  const f=await fixture(),target=await f.page('Mention target');
  const source=await f.request('POST','/api/pages',{operationKey:createUlid(),containerId:f.containerId,title:'Source',blocks:[{id:createUlid(),blockType:'paragraph',treePosition:'1',content:{text:[{text:'Target',mention:{kind:'page',id:target.id}}]}}]});
  expect(source.status).toBe(200);const sourceId=source.data.value.pageId;
  expect((await f.request('GET',`/api/pages/${sourceId}`)).data.mentions[target.id]).toMatchObject({label:'Mention target',available:true,state:'live'});
  expect((await f.request('POST',`/api/archive/${target.id}`,{operationKey:createUlid(),expectedRevisionId:target.revisionId,action:'archive'})).status).toBe(200);
  expect((await f.request('GET',`/api/pages/${sourceId}`)).data.mentions[target.id]).toMatchObject({label:'Mention target',available:true,state:'archived'});
  expect((await f.request('POST',`/api/archive/${target.id}`,{operationKey:createUlid(),expectedRevisionId:target.revisionId,action:'trash'})).status).toBe(200);
  expect((await f.request('GET',`/api/pages/${sourceId}`)).data.mentions[target.id]).toMatchObject({label:'Mention target',available:false,state:'trashed'});
  expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:sourceId,principalKind:'member',principalId:f.readerId,level:'view'})).status).toBe(200);
  expect((await f.request('GET',`/api/pages/${sourceId}`,undefined,f.readerId)).data.mentions[target.id]).toEqual({label:'Restricted page',available:false,state:'restricted'});
  expect((await f.request('POST',`/api/archive/${target.id}/permanent-delete`,{operationKey:createUlid(),confirmedPageIds:[target.id]})).status).toBe(200);
  const deleted=(await f.request('GET',`/api/pages/${sourceId}`)).data.mentions[target.id];
  expect(deleted).toMatchObject({label:'Deleted page',available:false,state:'deleted'});expect(deleted.deletedAt).toBeTruthy();expect(JSON.stringify(deleted)).not.toContain('Mention target');
  expect((await f.request('GET',`/api/pages/${sourceId}`,undefined,f.readerId)).data.mentions[target.id]).toEqual({label:'Restricted page',available:false,state:'restricted'});
});
