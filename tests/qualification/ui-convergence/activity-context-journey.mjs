import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-support.mjs';
import {ok,call,restrictedPage,grant,withSecondPerson} from './two-people-support.mjs';

/** Real activity links retain native record context through navigation and reload. */
export async function activityContextJourney(state,width) {
 const {page,context,origin}=state;
 const mutation=(method,route,data)=>ok(context,origin,method,route,{operationKey:randomUUID(),...data});
 const read=route=>ok(context,origin,'GET',route);
 const target=await restrictedPage(state,'Activity context page',['Original page body']);
 let document=await read(`/api/pages/${target.pageId}`);
 const version=await mutation('PUT',`/api/pages/${target.pageId}/blocks`,{expectedRevisionId:document.page.revisionId,blocks:[{id:target.blockIds[0],blockType:'paragraph',treePosition:'1',content:{text:[{text:'Referenced revision body'}]}}]});
 await mutation('PUT',`/api/pages/${target.pageId}/blocks`,{expectedRevisionId:version.value.revisionId,blocks:[{id:target.blockIds[0],blockType:'paragraph',treePosition:'1',content:{text:[{text:'Current page body'}]}}]});
 const comment=await mutation('POST',`/api/comments/page/${target.pageId}`,{body:[{text:'Original referenced comment'}]});
 const edited=await mutation('PATCH',`/api/comments/${comment.value.id}`,{expectedRevisionId:comment.value.revisionId,body:[{text:'Referenced comment body'}]});
 const thread=await mutation('POST',`/api/comments/thread/${comment.value.threadId}/resolve`,{expectedRevisionId:edited.value.revisionId,resolved:true});
 const shared=await grant(context,origin,target.pageId,'browser-reader','full');
 const space=await mutation('POST','/api/containers',{name:'Activity context space',visibility:'private'});
 const spaceGrant=await mutation('POST','/api/sharing',{targetKind:'container',targetId:space.value.id,principalKind:'member',principalId:'browser-reader',level:'view'});
 const activity=()=>read('/api/activity?limit=100');
 const receipts=[version,comment,edited,thread,shared,spaceGrant];
 const original=(await activity()).items.filter(item=>receipts.some(result=>result.receipt.activityId===item.id));
 assert.equal(original.length,receipts.length,'All native context mutations reach the timeline.');
 const saved=JSON.stringify(original);
 const cases=[
  {result:version,panel:'History',params:{revision:version.value.revisionId},check:async()=>{await expect(page.locator('.revision-preview')).toContainText('Referenced revision body');await expect(page.locator('.revision-preview')).not.toContainText('Current page body');await expect(page.locator('.history-list button[aria-pressed="true"]')).toHaveCount(1);}},
  {result:comment,panel:'Comments',params:{comment:comment.value.id,thread:comment.value.threadId},check:async()=>{const selected=page.locator(`#comment-${comment.value.id}`);await expect(selected).toContainText('Referenced comment body');await expect(selected.getByRole('status')).toHaveText('Referenced comment');await expect(page.getByRole('region',{name:'History',exact:true})).toHaveCount(0);}},
  {result:edited,panel:'Comments',params:{comment:comment.value.id,thread:comment.value.threadId},check:async()=>{await expect(page.locator(`#comment-${comment.value.id}`)).toContainText('Referenced comment body');await expect(page.getByRole('region',{name:'History',exact:true})).toHaveCount(0);}},
  {result:thread,panel:'Comments',params:{thread:comment.value.threadId},check:async()=>{const selected=page.locator(`#thread-${comment.value.threadId}`);await expect(selected).toContainText('Resolved');await expect(selected.getByRole('status')).toHaveText('Referenced thread');}},
  {result:shared,panel:'Share page',params:{grant:shared.value.id},check:async()=>{const selected=page.locator(`#grant-${shared.value.id}`);await expect(selected).toHaveAttribute('aria-current','true');await expect(selected).toContainText('Referenced access change');await expect(selected).toContainText('Morgan Reader');await expect(selected.getByLabel('Access for Morgan Reader',{exact:true})).toHaveValue('full');}},
  {result:spaceGrant,params:{grant:spaceGrant.value.id,tab:'settings'},check:async()=>{await expect(page.getByRole('heading',{name:'Activity context space',exact:true})).toBeVisible();const selected=page.locator(`#grant-${spaceGrant.value.id}`);await expect(selected).toHaveAttribute('aria-current','true');await expect(selected).toContainText('Referenced access change');await expect(selected).toContainText('Morgan Reader');}},
 ];
 for(const [index,item] of cases.entries()) {
  await page.goto(origin+'/app/settings?section=activity',{waitUntil:'networkidle'});
  const link=page.locator(`[data-activity-id="${item.result.receipt.activityId}"] a`);
  await expect(link).toBeVisible();
  await link.click();
  for(const reload of [false,true]) {
   if(reload)await page.reload({waitUntil:'networkidle'});
   if(width===1440) {
    assert.equal(new URL(page.url()).pathname,index===cases.length-1?`/app/containers/${space.value.id}`:`/app/pages/${target.pageId}`);
    for(const [key,value] of Object.entries(item.params))assert.equal(new URL(page.url()).searchParams.get(key),value);
    if(item.panel)await expect(page.getByRole('region',{name:item.panel,exact:true})).toBeVisible();
    await item.check();
   }
  }
  if([0,1,3,4,5].includes(index))await accessible(page,`activity referenced context ${index}`);
 }
 const retained=(await activity()).items.filter(item=>original.some(prior=>prior.id===item.id));
 assert.equal(JSON.stringify(retained),saved,'Opening and reloading changes no retained entry.');
 await withSecondPerson(state,width,async people=>{
  const reader=people.bob;
  assert.equal((await call(reader.context,origin,'GET',`/api/pages/${target.pageId}`)).status,200);
  await grant(context,origin,target.pageId,'browser-reader','full',{id:shared.value.id,revoke:true});
  const before=JSON.stringify((await activity()).items.filter(item=>original.some(prior=>prior.id===item.id)));
  const timeline=await ok(reader.context,origin,'GET','/api/activity?limit=100');
  assert.equal(timeline.items.some(item=>item.context.pageId===target.pageId),false,'Revoked target entries are absent.');
  for(const item of cases.slice(0,-1)) {
   const url=new URL(`/app/pages/${target.pageId}`,origin);url.searchParams.set('detail',item.panel==='History'?'history':item.panel==='Comments'?'comments':'share');for(const [key,value]of Object.entries(item.params))url.searchParams.set(key,value);
   await reader.page.goto(url.href,{waitUntil:'networkidle'});await reader.page.reload({waitUntil:'networkidle'});
   await expect(reader.page.locator('body')).not.toContainText(/Activity context page|Referenced revision body|Current page body|Referenced comment body/);
  }
  for(const route of [`/api/pages/${target.pageId}`,`/api/comments/page/${target.pageId}`,`/api/revisions/${target.pageId}/${version.value.revisionId}`,`/api/sharing/pages/${target.pageId}`]) {const result=await call(reader.context,origin,'GET',route);assert.ok(result.status>=400);assert.doesNotMatch(JSON.stringify(result.body),/Referenced revision body|Current page body|Referenced comment body/);}
  assert.equal(JSON.stringify((await activity()).items.filter(item=>original.some(prior=>prior.id===item.id))),before);
  await accessible(reader.page,'activity revoked context refusal');
 });
}
