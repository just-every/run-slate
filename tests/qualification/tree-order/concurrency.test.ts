import {describe,it,expect} from 'vitest';
import {fixture,ids,input,beforeBatch,databaseState,env,seedPage,movePage,seedPageGrant} from './fixture';

describe('TREE-002 same-batch membership, authority and topology guards',()=>{
 it('rolls back all tables when membership, authority or topology mutations race preparation',async()=>{
  for(const mutation of ['insert','key','location','delete','subtree-insert','subtree-edge','destination-archive','revoke','inactive','revision'] as const){
  const f=await fixture([null,null,'z']),[a,b,root]=await ids(f.containerId);
  const child=await seedPage(f.containerId,{title:'Child',authorMemberId:f.memberId,parentPageId:root});
  const request=await input(f.ctx,root,{containerId:f.containerId,beforeId:a});
  let before:Awaited<ReturnType<typeof databaseState>>|undefined;
  const raced=beforeBatch(f.ctx,async()=>{
   if(mutation==='insert')await seedPage(f.containerId,{title:'Concurrent new sibling',authorMemberId:f.memberId});
   if(mutation==='key')await env.DB.prepare('UPDATE pages SET tree_position=? WHERE id=?').bind('raced',b).run();
   if(mutation==='location')await env.DB.prepare('UPDATE pages SET parent_page_id=? WHERE id=?').bind(a,b).run();
   if(mutation==='delete')await env.DB.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(f.ctx.now,b).run();
   if(mutation==='subtree-insert')await seedPage(f.containerId,{title:'Concurrent descendant',authorMemberId:f.memberId,parentPageId:root});
   if(mutation==='subtree-edge')await env.DB.prepare('UPDATE pages SET parent_page_id=? WHERE id=?').bind(a,child.pageId).run();
   if(mutation==='destination-archive')await env.DB.prepare('UPDATE containers SET archived_at=? WHERE id=?').bind(f.ctx.now,f.containerId).run();
   if(mutation==='revoke')await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE container_id=?').bind(f.ctx.now,f.containerId).run();
   if(mutation==='inactive')await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(f.memberId).run();
   if(mutation==='revision')await env.DB.prepare('UPDATE pages SET revision_id=? WHERE id=?').bind(crypto.randomUUID(),root).run();
   before=await databaseState();
  });
  await expect(movePage(raced,root,request)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  expect(before).toBeDefined();expect(await databaseState()).toEqual(before);
  }
 });
 it('rejects stale root revision and access preview without receipts or partial maintenance',async()=>{
  const f=await fixture([null,'','z']),order=await ids(f.containerId),id=order[2];const request=await input(f.ctx,id,{containerId:f.containerId,beforeId:order[0]});const before=await databaseState();
  await expect(movePage(f.ctx,id,{...request,expectedRevisionId:'stale'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await databaseState()).toEqual(before);
  await expect(movePage(f.ctx,id,{...request,accessPreviewHash:'stale'})).rejects.toMatchObject({code:'ACCESS_PREVIEW_CHANGED'});expect(await databaseState()).toEqual(before);
 });
});
it('guards anchor liveness even when archiving does not change the ACL epoch',async()=>{
 const f=await fixture([null,'','z']),[anchor,,id]=await ids(f.containerId),request=await input(f.ctx,id,{containerId:f.containerId,beforeId:anchor});let expected:unknown;
 const raced=beforeBatch(f.ctx,async()=>{await env.DB.prepare('UPDATE pages SET archived_at=? WHERE id=?').bind(f.ctx.now,anchor).run();expected=await databaseState();});
 await expect(movePage(raced,id,request)).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await databaseState()).toEqual(expected);
});
it('guards new sibling membership on no-op and destination parent liveness on reparent',async()=>{
 const f=await fixture(),[a,b,id]=await ids(f.containerId);let expected:unknown;
 const unchanged=await input(f.ctx,a,{containerId:f.containerId,beforeId:b});
 const raced=beforeBatch(f.ctx,async()=>{await seedPage(f.containerId,{title:'Inserted',authorMemberId:f.memberId});expected=await databaseState();});
 await expect(movePage(raced,a,unchanged)).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await databaseState()).toEqual(expected);
 const reparent=await input(f.ctx,id,{containerId:f.containerId,parentPageId:b,atEnd:true});
 const archived=beforeBatch(f.ctx,async()=>{await env.DB.prepare('UPDATE pages SET archived_at=? WHERE id=?').bind(f.ctx.now,b).run();expected=await databaseState();});
 await expect(movePage(archived,id,reparent)).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await databaseState()).toEqual(expected);
});
