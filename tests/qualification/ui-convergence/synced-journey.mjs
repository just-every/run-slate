import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {call,ok} from './two-people-support.mjs';
import {mkdir} from 'node:fs/promises';
import {tap,type,checkpoint} from './touch-controls.mjs';
import {saveAndMeasureSyncedCopy} from './synced-refresh.mjs';
export async function syncedJourney(state,width){
 const {origin,context,api}=state,key=()=>randomUUID(),title='Incident escalation source',initial='Contact the incident coordinator.',changed='Contact the duty lead immediately.';
 const container=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Incident source team',visibility:'private'})).value.id;
 const sourceBlock=key(),create=async(title,blocks)=>(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:container,title,blocks})).value.pageId;
 const source=await create(title,[{id:sourceBlock,blockType:'paragraph',content:{text:[{text:initial}]},treePosition:'0'}]);
 const copies=await Promise.all(['Response plan','Duty guide'].map(name=>create(name,[])));
 const browser=context.browser(),owner=await browser.newContext({viewport:{width,height:width===390?844:1000},hasTouch:true,isMobile:width===390,storageState:await context.storageState(),permissions:['clipboard-read','clipboard-write'],locale:'en-US'});
 const reader=await browser.newContext({viewport:{width,height:width===390?844:1000},hasTouch:true,isMobile:width===390,locale:'en-US'}),errors=[];
 for(const ctx of [owner,reader]){ctx.on('page',page=>{page.on('pageerror',cause=>errors.push(String(cause)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});});ctx.on('requestfailed',request=>errors.push(request.failure()?.errorText));ctx.on('response',response=>{if(response.status()>=400)errors.push(`${new URL(response.url()).pathname} ${response.status()}`);});}
 try{
  const page=await owner.newPage();await page.goto(`${origin}/app/pages/${source}`,{waitUntil:'networkidle'});
  const handle=page.locator(`[data-block-id="${sourceBlock}"]`).getByRole('button',{name:/Block actions for/});await expect(handle).toHaveAttribute('data-tooltip','Block actions');await tap(handle);await tap(page.getByRole('menuitem',{name:'Make synced',exact:true}));
  await expect(page.getByRole('button',{name:'Copy synced block link',exact:true})).toBeVisible();await expect.poll(async()=>(await api(`/api/pages/${source}`)).blocks.find(b=>b.id===sourceBlock)?.blockType).toBe('synced-source');await tap(page.getByRole('button',{name:'Copy synced block link',exact:true}));
  const link=await page.evaluate(()=>navigator.clipboard.readText());assert.equal(link,`${origin}/app/pages/${source}#synced-block=${sourceBlock}`);
  await checkpoint(page,'synced source made');
  for(const id of copies){await page.goto(`${origin}/app/pages/${id}`,{waitUntil:'networkidle'});await tap(page.getByRole('button',{name:/Add block/}));await tap(page.getByRole('option',{name:'Synced block',exact:true}));const dialog=page.getByRole('dialog',{name:'Insert synced block',exact:true});await type(page,dialog.getByRole('textbox',{name:'Source block link',exact:true}),link);await tap(dialog.getByRole('button',{name:'Insert synced copy',exact:true}));await expect(dialog).toBeHidden();await expect(page.locator('[aria-label="Synced copy"]')).toContainText(initial);}
  await state.page.goto(`${origin}/app/pages/${copies[1]}`,{waitUntil:'networkidle'});await page.goto(`${origin}/app/pages/${copies[0]}`,{waitUntil:'networkidle'});
  await type(page,page.getByRole('textbox',{name:'Synced paragraph',exact:true}),changed);
  await saveAndMeasureSyncedCopy(page,state.page,changed);await checkpoint(page,'synced copy edited');
  const readerId=(await context.request.get(origin+'/api/members')).json().then(body=>body.items.find(m=>m.displayName==='Morgan Reader').id);
  const grant=(await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:copies[0],principalKind:'member',principalId:await readerId,level:'edit'})).value.id;
  await reader.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:origin}]);const denied=await reader.newPage();await denied.goto(`${origin}/app/pages/${copies[0]}`,{waitUntil:'networkidle'});await expect(denied.getByRole('complementary',{name:'Access needed',exact:true})).toBeVisible();await expect(denied.locator('body')).not.toContainText(changed);await expect(denied.locator('body')).not.toContainText(title);await checkpoint(denied,'synced source access needed');
  const access=denied.getByRole('complementary',{name:'Access needed',exact:true}),requestButton=access.getByRole('button',{name:'Request access',exact:true});
  await expect(access.getByRole('link')).toHaveCount(0);await expect(access.locator('img')).toHaveCount(0);await expect(access).not.toContainText('Alex Owner');
  const beforeRequests=await Promise.all([api(`/api/pages/${source}`),api(`/api/pages/${copies[0]}`),api(`/api/sharing/pages/${source}`),api(`/api/sharing/pages/${copies[0]}`)]);
  const pending=denied.waitForResponse(response=>new URL(response.url()).pathname===`/api/sharing/pages/${source}/request-access`);
  await tap(requestButton);const requested=await pending;assert.equal(requested.status(),202);assert.deepEqual(await requested.json(),{accepted:true});
  await expect(denied.getByRole('status').filter({hasText:'Access request received'})).toBeVisible();
  const submitted=requested.request().postDataJSON();
  // A second native action has its own receipt but the same daily notice.
  await tap(denied.getByRole('status').filter({hasText:'Access request received'}).getByRole('button',{name:'Dismiss',exact:true}));
  const again=denied.waitForResponse(response=>new URL(response.url()).pathname===`/api/sharing/pages/${source}/request-access`);
  await tap(requestButton);const distinct=await again;
  assert.equal(distinct.status(),202);assert.deepEqual(await distinct.json(),{accepted:true});
  assert.notEqual(distinct.request().postDataJSON().operationKey,submitted.operationKey);
  for(const [id,operationKey] of [[source,submitted.operationKey],[key(),key()]]){
   const replay=await call(reader,origin,'POST',`/api/sharing/pages/${id}/request-access`,{operationKey});assert.equal(replay.status,202);assert.deepEqual(replay.body,{accepted:true});
  }
  assert.deepEqual(await Promise.all([api(`/api/pages/${source}`),api(`/api/pages/${copies[0]}`),api(`/api/sharing/pages/${source}`),api(`/api/sharing/pages/${copies[0]}`)]),beforeRequests,'Requests leave source, copy and grants unchanged.');
  const ownerId=(await api('/api/session')).member.id;
  const notice=(await api('/api/notifications')).items.filter(item=>item.event==='access-requested'&&item.pageId===source);assert.equal(notice.length,1);assert.deepEqual(notice[0].detail,{requesterMemberId:await readerId});
  assert.equal((await call(reader,origin,'GET',`/api/pages/${source}`)).status,404);
  const deniedDocument=await ok(reader,origin,'GET',`/api/pages/${copies[0]}`);
  const deniedReference=deniedDocument.blocks.find(block=>block.blockType==='synced-reference');
  assert.ok(deniedReference,'The readable copy retains its synced reference.');
  assert.deepEqual(deniedReference.synced,{state:'access-needed'});
  assert.ok(!JSON.stringify(deniedDocument).includes(title)&&!JSON.stringify(deniedDocument).includes(changed),'The native copy readback carries no source title or body.');
  await denied.reload({waitUntil:'networkidle'});await expect(access).toBeVisible();await expect(denied.locator('body')).not.toContainText(changed);await expect(denied.locator('body')).not.toContainText(title);
  await checkpoint(denied,'synced access request received');
  const evidence=`.artifacts/ui-convergence/synced-request/${width}`;await mkdir(evidence,{recursive:true});await denied.screenshot({path:`${evidence}/access-needed.png`,fullPage:true});
  const sourceGrant=(await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:source,principalKind:'member',principalId:await readerId,level:'view'})).value.id;
  await denied.reload({waitUntil:'networkidle'});await expect(denied.locator('[aria-label="Synced copy"]')).toContainText(changed);await expect(denied.locator('[aria-label="Synced copy"]')).toContainText(title);await expect(access).toHaveCount(0);await expect(denied.getByRole('button',{name:'Save synced block',exact:true})).toHaveCount(0);
  await checkpoint(denied,'explicit grant reveals live synced source');await denied.screenshot({path:`${evidence}/granted-source.png`,fullPage:true});
  await ok(context,origin,'POST','/api/sharing',{operationKey:key(),id:sourceGrant,targetKind:'page',targetId:source,principalKind:'member',principalId:await readerId,level:'view',revoke:true});
  await denied.reload({waitUntil:'networkidle'});await expect(access).toBeVisible();await expect(denied.locator('body')).not.toContainText(changed);await expect(denied.locator('body')).not.toContainText(title);
  console.log(`PROBE BLOCK-011 access request: native reader -> generic receipt; replay and distinct native requests -> one current grantor notice (${ownerId}); grants and content unchanged; explicit grant -> live source; revocation -> access needed at ${width}px`);
  await denied.goto(origin+'/app',{waitUntil:'networkidle'});await ok(context,origin,'POST','/api/sharing',{operationKey:key(),id:grant,targetKind:'page',targetId:copies[0],principalKind:'member',principalId:await readerId,level:'edit',revoke:true});
  const doc=await api(`/api/pages/${source}`);await ok(context,origin,'POST',`/api/archive/${source}`,{operationKey:key(),expectedRevisionId:doc.page.revisionId,action:'trash'});
  await page.goto(origin+'/app/archive',{waitUntil:'networkidle'});await tap(page.getByRole('group',{name:'Archive and trash',exact:true}).getByRole('button',{name:'Trash',exact:true}));const row=page.locator('.archive-list li').filter({has:page.getByRole('heading',{name:title,exact:true})});await tap(row.getByRole('button',{name:'Delete permanently',exact:true}));
  const deleting=page.getByRole('dialog',{name:`Permanently delete ${title}?`,exact:true});await expect(deleting.getByRole('checkbox')).toHaveCount(1);await tap(deleting.getByRole('checkbox',{name:title,exact:true}));await type(page,deleting.getByRole('textbox',{name:'Type the page title',exact:true}),title);await checkpoint(page,'synced source deletion confirmation');await tap(deleting.getByRole('button',{name:'Delete permanently',exact:true}));await expect(deleting).toBeHidden();
  await page.goto(`${origin}/app/pages/${copies[0]}`,{waitUntil:'networkidle'});await expect(page.locator('[aria-label="Synced copy"]')).toHaveCount(0);await expect(page.locator('[data-page-editor]')).toContainText(changed);await expect(page.locator('[data-page-editor]')).toContainText(`Source: ${title}`);await checkpoint(page,'synced static copy after deletion');
  for(const id of copies)assert.ok((await api(`/api/pages/${id}`)).blocks.every(b=>b.blockType!=='synced-reference'));
  assert.deepEqual(errors,[],'Synced screens have no failed request, browser error or hydration mismatch.');
 }finally{await owner.close();await reader.close();}
 console.log(`BLOCK-011 synced paragraphs, live copy, access needed and static deletion passed at ${width}px`);
}

/** Phone smoke for the changed request surface; functional outcomes run at desktop width. */
export async function syncedRequestPhoneJourney(state){
 const {context,origin}=state,key=()=>randomUUID();
 const container=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Phone source team',visibility:'private'})).value.id;
 const blockId=key(),title='Restricted phone source',text='Restricted phone instructions';
 const source=(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:container,title,blocks:[{id:blockId,blockType:'synced-source',content:{text:[{text}]},treePosition:'0'}]})).value.pageId;
 const copy=(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:container,title:'Phone response plan',blocks:[{id:key(),blockType:'synced-reference',content:{sourcePageId:source,sourceBlockId:blockId},treePosition:'0'}]})).value.pageId;
 const readerId=(await state.api('/api/members')).items.find(member=>member.displayName==='Morgan Reader').id;
 await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:copy,principalKind:'member',principalId:readerId,level:'view'});
 const reader=await context.browser().newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,locale:'en-US'});
 try{
  await reader.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:origin}]);
  const page=await reader.newPage();await page.goto(`${origin}/app/pages/${copy}`,{waitUntil:'networkidle'});
  const access=page.getByRole('complementary',{name:'Access needed',exact:true});
  await expect(access).toBeVisible();await expect(page.locator('body')).not.toContainText(title);await expect(page.locator('body')).not.toContainText(text);
  const request=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/sharing/pages/${source}/request-access`);
  await tap(access.getByRole('button',{name:'Request access',exact:true}));await request;
  await expect(page.getByRole('status').filter({hasText:'Access request received'})).toBeVisible();
  await checkpoint(page,'phone synced access request');
  const evidence='.artifacts/ui-convergence/synced-request/390';await mkdir(evidence,{recursive:true});await page.screenshot({path:`${evidence}/access-needed.png`,fullPage:true});
  await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:source,principalKind:'member',principalId:readerId,level:'view'});
  await page.reload({waitUntil:'networkidle'});await expect(page.locator('[aria-label="Synced copy"]')).toContainText(text);
  await checkpoint(page,'phone explicitly granted synced source');await page.screenshot({path:`${evidence}/granted-source.png`,fullPage:true});
  console.log('PROBE BLOCK-011 phone: native view-only copy -> reachable request and generic receipt at 390px; explicit grant -> source readback.');
 }finally{await reader.close();}
}
