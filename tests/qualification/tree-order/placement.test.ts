import {describe,it,expect} from 'vitest';
import {fixture,ids,input,bystanders,databaseState,env,seedMember,seedPage,seedPageGrant,seedContainer,movePage,previewMove} from './fixture';

describe('TREE-002 server placement on canonical stored positions',()=>{
 for(const positions of [[null,null,'z'],['','', 'z'],['a','a','z'],['a','b','z']] as (string|null)[][])it(`moves before first ${JSON.stringify(positions)} preserving bystander content`,async()=>{
  const f=await fixture(positions),order=await ids(f.containerId),id=order[2],others=order.slice(0,2),before=await bystanders(others);
  const request=await input(f.ctx,id,{containerId:f.containerId,beforeId:order[0]});
  const response=await movePage(f.ctx,id,request);
  expect(await ids(f.containerId)).toEqual([id,...others]);expect(await bystanders(others)).toEqual(before);expect(response.receipt.unchanged).toBeUndefined();
  expect(await movePage(f.ctx,id,request)).toEqual(response);
  await expect(movePage(f.ctx,id,{...request,atEnd:true,beforeId:undefined})).rejects.toMatchObject({status:400});
  await expect(movePage(f.ctx,id,{...request,beforeId:others[1]})).rejects.toMatchObject({code:'OPERATION_KEY_CONFLICT'});
 });
 it('supports after, end, empty destination and legacy callers',async()=>{
  const f=await fixture(),[a,b,c]=await ids(f.containerId);
  await movePage(f.ctx,a,await input(f.ctx,a,{containerId:f.containerId,afterId:b}));expect(await ids(f.containerId)).toEqual([b,a,c]);
  await movePage(f.ctx,b,await input(f.ctx,b,{containerId:f.containerId,atEnd:true}));expect(await ids(f.containerId)).toEqual([a,c,b]);
  const dest=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'open'});
  await movePage(f.ctx,c,await input(f.ctx,c,{containerId:dest.containerId,atEnd:true}));expect(await ids(dest.containerId)).toEqual([c]);
  const preview=await previewMove(f.ctx,a,{containerId:f.containerId});expect(preview).not.toHaveProperty('orderPreviewHash');
  await movePage(f.ctx,a,{...(await input(f.ctx,a,{containerId:f.containerId})),treePosition:'zzzz'});expect(await ids(f.containerId)).toEqual([b,a]);
 });
 it('no-op retains revision, content, timestamps and activity but records a replayable receipt',async()=>{
  const f=await fixture(),order=await ids(f.containerId),id=order[0],prior=await bystanders(order);
  const activities=(await env.DB.prepare('SELECT * FROM activity_entries').all()).results;
  const request=await input(f.ctx,id,{containerId:f.containerId,beforeId:order[1]});const result=await movePage(f.ctx,id,request);
  expect(result.receipt.unchanged).toBe(true);expect(result.receipt.activityId).toBeNull();expect(await bystanders(order)).toEqual(prior);expect((await env.DB.prepare('SELECT * FROM activity_entries').all()).results).toEqual(activities);expect(await movePage(f.ctx,id,request)).toEqual(result);
 });
 it('repairs around hidden siblings without edit authority or disclosing their identity',async()=>{
  const f=await fixture([null,null,'z']),order=await ids(f.containerId),[a,hidden,id]=order;
  const other=await seedMember(f.workspaceId,{role:'member',displayName:'Hidden Author',email:crypto.randomUUID()+'@test.invalid'});
  await env.DB.prepare("UPDATE pages SET access_inheritance='restricted',author_member_id=? WHERE id=?").bind(other.memberId,hidden).run();
  const prior=await bystanders([a,hidden]);const request=await input(f.ctx,id,{containerId:f.containerId,beforeId:a});
  expect(JSON.stringify(request)).not.toContain(hidden);expect(Object.keys(request).sort()).toEqual(['accessPreviewHash','beforeId','changes','containerId','expectedRevisionId','operationKey','orderPreviewHash'].sort());
  await movePage(f.ctx,id,request);expect(await ids(f.containerId)).toEqual([id,a,hidden]);expect(await bystanders([a,hidden])).toEqual(prior);
  await expect(previewMove(f.ctx,id,{containerId:f.containerId,beforeId:hidden})).rejects.toMatchObject({status:404});
 });
 it('reparents a subtree with access preview and preserves descendant parent links',async()=>{
  const f=await fixture(),root=f.pages[0].pageId;const child=await seedPage(f.containerId,{title:'Child',authorMemberId:f.memberId,parentPageId:root});
  const dest=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'closed'});
  const parent=await seedPage(dest.containerId,{title:'Parent',authorMemberId:f.memberId});await seedPageGrant(parent.pageId,{principalKind:'member',principalId:f.memberId,level:'full'});
  const request=await input(f.ctx,root,{containerId:dest.containerId,parentPageId:parent.pageId,atEnd:true});
  expect(request.accessPreviewHash).toMatch(/^[a-f0-9]{64}$/);expect(request.changes.length).toBeGreaterThan(0);
  await movePage(f.ctx,root,request);expect(await ids(dest.containerId,parent.pageId)).toEqual([root]);expect(await ids(dest.containerId,root)).toEqual([child.pageId]);
 });
 it('rejects invalid direct service selectors and stale anchors without any writes',async()=>{
  const f=await fixture(),[a,b]=await ids(f.containerId),prior=await databaseState();
  for(const selector of [{beforeId:null},{beforeId:a},{beforeId:'missing'},{beforeId:b,atEnd:true},{treePosition:'x',beforeId:b},{atEnd:false},{afterId:12}])await expect(previewMove(f.ctx,a,{containerId:f.containerId,...selector} as never)).rejects.toBeDefined();
  expect(await databaseState()).toEqual(prior);
  const request=await input(f.ctx,a,{containerId:f.containerId,afterId:b});await env.DB.prepare('UPDATE pages SET tree_position=? WHERE id=?').bind('changed',b).run();const changed=await databaseState();
  await expect(movePage(f.ctx,a,request)).rejects.toMatchObject({code:'ORDER_PREVIEW_CHANGED'});expect(await databaseState()).toEqual(changed);
 });
});

it('maintains full binary SQL order across null, empty, tied and Unicode bystanders',async()=>{
 const f=await fixture([null,'','a','a','\uE000','\u{10000}','z']);const original=await ids(f.containerId),id=original.at(-1)!;
 const before=await bystanders(original.filter(x=>x!==id));
 await movePage(f.ctx,id,await input(f.ctx,id,{containerId:f.containerId,afterId:original[0]}));
 expect(await ids(f.containerId)).toEqual([original[0],id,...original.slice(1,-1)]);expect(await bystanders(original.filter(x=>x!==id))).toEqual(before);
});
it('repairs more than one bounded SQL chunk without touching bystander revisions',async()=>{
 const f=await fixture(Array.from({length:104},()=>null));const order=await ids(f.containerId),id=order.at(-1)!,others=order.slice(0,-1),prior=await bystanders(others);
 await movePage(f.ctx,id,await input(f.ctx,id,{containerId:f.containerId,beforeId:order[0]}));expect(await ids(f.containerId)).toEqual([id,...others]);expect(await bystanders(others)).toEqual(prior);
});
it('requires only edit authority and preserves hidden sibling bookkeeping',async()=>{
 const f=await fixture([null,null,'z']),[a,hidden,id]=await ids(f.containerId);
 await env.DB.prepare('DELETE FROM container_owners WHERE container_id=?').bind(f.containerId).run();
 await env.DB.prepare("UPDATE members SET role='member' WHERE id=?").bind(f.memberId).run();f.ctx.actor.role='member';
 const other=await seedMember(f.workspaceId,{role:'owner',displayName:'Private author',email:crypto.randomUUID()+'@test.invalid'});
 await env.DB.prepare("UPDATE pages SET access_inheritance='restricted',author_member_id=? WHERE id=?").bind(other.memberId,hidden).run();
 const before=await bystanders([a,hidden]);await movePage(f.ctx,id,await input(f.ctx,id,{containerId:f.containerId,beforeId:a}));
 expect(await ids(f.containerId)).toEqual([id,a,hidden]);expect(await bystanders([a,hidden])).toEqual(before);
});
it('allocates within prefix boundaries without repairing bystander keys when a text key fits',async()=>{
 const f=await fixture(['a','a\u0000b','z']),order=await ids(f.containerId),id=order[2];const keysBefore=(await env.DB.prepare('SELECT id,tree_position FROM pages WHERE id IN (?,?) ORDER BY id').bind(order[0],order[1]).all()).results;
 await movePage(f.ctx,id,await input(f.ctx,id,{containerId:f.containerId,beforeId:order[1]}));expect(await ids(f.containerId)).toEqual([order[0],id,order[1]]);expect((await env.DB.prepare('SELECT id,tree_position FROM pages WHERE id IN (?,?) ORDER BY id').bind(order[0],order[1]).all()).results).toEqual(keysBefore);
});
it('preserves subtree edit authority and stale descendant preview boundaries',async()=>{
 const f=await fixture(),[id,anchor]=await ids(f.containerId),child=await seedPage(f.containerId,{title:'Child',authorMemberId:f.memberId,parentPageId:id});
 const request=await input(f.ctx,id,{containerId:f.containerId,afterId:anchor});await env.DB.prepare('UPDATE pages SET revision_id=? WHERE id=?').bind(crypto.randomUUID(),child.pageId).run();const stale=await databaseState();await expect(movePage(f.ctx,id,request)).rejects.toMatchObject({code:'ACCESS_PREVIEW_CHANGED'});expect(await databaseState()).toEqual(stale);
 await env.DB.prepare("UPDATE pages SET access_inheritance='restricted' WHERE id=?").bind(child.pageId).run();const restricted=await databaseState();await expect(previewMove(f.ctx,id,{containerId:f.containerId,afterId:anchor})).rejects.toMatchObject({status:404});expect(await databaseState()).toEqual(restricted);
});
it('requires both hashes and the source revision for relative confirmation',async()=>{
 const f=await fixture(),[id,anchor]=await ids(f.containerId),request=await input(f.ctx,id,{containerId:f.containerId,afterId:anchor}),prior=await databaseState();
 for(const override of [{orderPreviewHash:undefined},{accessPreviewHash:undefined},{expectedRevisionId:undefined},{operationKey:undefined},{treePosition:'legacy'}])await expect(movePage(f.ctx,id,{...request,...override} as never)).rejects.toMatchObject({status:400});
 expect(await databaseState()).toEqual(prior);
});
