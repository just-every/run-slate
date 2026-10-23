import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {tap,type,checkpoint} from './touch-controls.mjs';
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
  await expect(page.getByRole('button',{name:'Copy synced block link',exact:true})).toBeVisible();await tap(page.getByRole('button',{name:'Copy synced block link',exact:true}));
  const link=await page.evaluate(()=>navigator.clipboard.readText());assert.equal(link,`${origin}/app/pages/${source}#synced-block=${sourceBlock}`);
  await checkpoint(page,'synced source made');
  for(const id of copies){await page.goto(`${origin}/app/pages/${id}`,{waitUntil:'networkidle'});await tap(page.getByRole('button',{name:/Add block/}));await tap(page.getByRole('option',{name:'Synced block',exact:true}));const dialog=page.getByRole('dialog',{name:'Insert synced block',exact:true});await type(page,dialog.getByRole('textbox',{name:'Source block link',exact:true}),link);await tap(dialog.getByRole('button',{name:'Insert synced copy',exact:true}));await expect(dialog).toBeHidden();await expect(page.locator('[aria-label="Synced copy"]')).toContainText(initial);}
  await state.page.goto(`${origin}/app/pages/${copies[1]}`,{waitUntil:'networkidle'});await page.goto(`${origin}/app/pages/${copies[0]}`,{waitUntil:'networkidle'});
  await type(page,page.getByRole('textbox',{name:'Synced paragraph',exact:true}),changed);
  const started=Date.now();await tap(page.getByRole('button',{name:'Save synced block',exact:true}));await expect(state.page.locator('[aria-label="Synced copy"]')).toContainText(changed,{timeout:5000});assert.ok(Date.now()-started<=5000,'The visible copy refreshes within five seconds.');await checkpoint(page,'synced copy edited');
  const readerId=(await context.request.get(origin+'/api/members')).json().then(body=>body.items.find(m=>m.displayName==='Morgan Reader').id);
  const grant=(await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:copies[0],principalKind:'member',principalId:await readerId,level:'edit'})).value.id;
  await reader.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:origin}]);const denied=await reader.newPage();await denied.goto(`${origin}/app/pages/${copies[0]}`,{waitUntil:'networkidle'});await expect(denied.getByRole('complementary',{name:'Access needed',exact:true})).toBeVisible();await expect(denied.locator('body')).not.toContainText(changed);await expect(denied.locator('body')).not.toContainText(title);await checkpoint(denied,'synced source access needed');
  await denied.goto(origin+'/app',{waitUntil:'networkidle'});await ok(context,origin,'POST','/api/sharing',{operationKey:key(),id:grant,targetKind:'page',targetId:copies[0],principalKind:'member',principalId:await readerId,level:'edit',revoke:true});
  const doc=await api(`/api/pages/${source}`);await ok(context,origin,'POST',`/api/archive/${source}`,{operationKey:key(),expectedRevisionId:doc.page.revisionId,action:'trash'});
  await page.goto(origin+'/app/archive',{waitUntil:'networkidle'});await tap(page.getByRole('group',{name:'Archive and trash',exact:true}).getByRole('button',{name:'Trash',exact:true}));const row=page.locator('.archive-list li').filter({has:page.getByRole('heading',{name:title,exact:true})});await tap(row.getByRole('button',{name:'Delete permanently',exact:true}));
  const deleting=page.getByRole('dialog',{name:`Permanently delete ${title}?`,exact:true});await type(page,deleting.getByRole('textbox',{name:'Type the page title',exact:true}),title);await checkpoint(page,'synced source deletion confirmation');await tap(deleting.getByRole('button',{name:'Delete permanently',exact:true}));await expect(deleting).toBeHidden();
  await page.goto(`${origin}/app/pages/${copies[0]}`,{waitUntil:'networkidle'});await expect(page.locator('[aria-label="Synced copy"]')).toHaveCount(0);await expect(page.locator('[data-page-editor]')).toContainText(changed);await expect(page.locator('[data-page-editor]')).toContainText(`Source: ${title}`);await checkpoint(page,'synced static copy after deletion');
  for(const id of copies)assert.ok((await api(`/api/pages/${id}`)).blocks.every(b=>b.blockType!=='synced-reference'));
  assert.deepEqual(errors,[],'Synced screens have no failed request, browser error or hydration mismatch.');
 }finally{await owner.close();await reader.close();}
 console.log(`BLOCK-011 synced paragraphs, live copy, access needed and static deletion passed at ${width}px`);
}
