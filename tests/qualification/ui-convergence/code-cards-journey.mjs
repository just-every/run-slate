import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
import {ok} from './two-people-support.mjs';
/** Native Settings and clipboard, emitted Worker, and recorded provider APIs. */
export async function codeCardsJourney(state){
 const {page,context,origin,api,switchIdentity,codeCredentials,setCodeFixture,readCodeRequests}=state;
 await page.clock.install();
 await switchIdentity('owner');
 const space=(await ok(context,origin,'POST','/api/containers',{operationKey:randomUUID(),name:'Source reviews'})).value.id;
 await ok(context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'container',targetId:space,principalKind:'member',principalId:'browser-reader',level:'view'});
 const pinned='1'.repeat(40),changedHead='3'.repeat(40),pages=[];
 for(const provider of ['github','gitlab']){
  const name=provider==='github'?'GitHub':'GitLab',base=provider==='github'?'https://github.com/synthetic-slate/project':'https://gitlab.com/synthetic-slate/project/-';
  const urls=[base+(provider==='github'?'/pull/7':'/merge_requests/7'),base+'/blob/'+pinned+'/src/main.ts#L2-L3'];
  const blocks=urls.map((_,index)=>({id:randomUUID(),blockType:'paragraph',treePosition:String(index),content:{text:[]}}));
  const pageId=(await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:space,title:name+' source review',blocks})).value.pageId;pages.push({pageId,provider,name});
  await setCodeFixture({moved:false});await page.goto(origin+'/app/pages/'+pageId,{waitUntil:'networkidle'});
  for(let index=0;index<blocks.length;index++){
   const editable=page.locator(`[data-block-id="${blocks[index].id}"]`).getByRole('textbox',{name:'Paragraph',exact:true});
   await expect(editable).toHaveAttribute('contenteditable','true');await editable.click();await page.evaluate(text=>navigator.clipboard.writeText(text),urls[index]);await editable.press('Control+V');
   await expect.poll(async()=> (await api('/api/pages/'+pageId)).blocks.find(block=>block.id===blocks[index].id)?.blockType).toBe('link-card');
  }
  const cards=page.getByRole('region',{name:name+' code card',exact:true}),pr=cards.nth(0),code=cards.nth(1);
  await expect(pr.getByRole('link',{name:'Connect to view',exact:true})).toBeVisible();
  await expect(page.locator('[data-page-editor]')).not.toContainText('Owner review');
  await pr.getByRole('link',{name:'Connect to view',exact:true}).click();
  const settings=page.getByRole('region',{name:'Code host connections',exact:true});
  await expect(settings.getByRole('button',{name:'Connect code account',exact:true})).toBeEnabled();
  await settings.getByLabel('Code host',{exact:true}).selectOption(provider);
  await settings.getByLabel('Read-only access token',{exact:true}).fill(codeCredentials[provider].owner);
  await settings.getByRole('button',{name:'Connect code account',exact:true}).click();
  await expect(settings.getByRole('button',{name:'Disconnect '+name,exact:true})).toBeEnabled();
  await expect(settings.getByLabel('Read-only access token',{exact:true})).toHaveValue('');
  await accessible(page,name+' code account connected');
  await page.goto(origin+'/app/pages/'+pageId,{waitUntil:'networkidle'});
  await expect(pr.getByRole('link',{name:'Owner review',exact:true})).toBeVisible();await expect(pr).toContainText('open');
  await expect(pr.getByRole('list',{name:'Checks',exact:true})).toContainText(provider==='github'?'Build: success':'Pipeline: success');
  await expect(pr.locator('time').first()).toHaveAttribute('datetime','2026-10-25T00:00:00Z');await expect(pr).toContainText('owner');
  await expect(code.locator('pre')).toContainText('pinned <script> line');await expect(code.locator('script')).toHaveCount(0);await expect(code).toContainText(pinned);
  assert.deepEqual(await code.locator('pre span[aria-hidden=true]').allTextContents(),['2','3']);
  await expect(code.getByText(/Changed since/)).toHaveCount(0);await code.scrollIntoViewIfNeeded();await expect(code).toBeInViewport();
  const before=await code.locator('time').getAttribute('datetime');
  try{await setCodeFixture({moved:true});await page.clock.fastForward(300001);
   await expect(code.getByText(/Changed since main/)).toBeVisible();await expect(code).toContainText(changedHead);
   await expect(code.locator('pre')).toContainText('pinned <script> line');await expect(code.locator('pre')).not.toContainText('changed line');
   await expect.poll(()=>code.locator('time').getAttribute('datetime')).not.toBe(before);
  }finally{await page.clock.setSystemTime(Date.now());await page.clock.resume();}
  await accessible(page,name+' pinned code after visible refresh');
  const stored=await api('/api/pages/'+pageId);assert.ok(!JSON.stringify(stored.blocks).includes('Owner review'));assert.ok(!JSON.stringify(stored.blocks).includes('pinned <script> line'));
  await ok(context,origin,'POST',`/api/publishing/${pageId}`,{operationKey:randomUUID(),expectedRevisionId:stored.page.revisionId,host:new URL(origin).host,slug:'code-'+provider});
  const visitor=await context.browser().newContext({viewport:page.viewportSize()}),external=[];
  await visitor.route(url=>url.origin!==origin,async route=>{external.push(route.request().url());await route.abort();});
  const publicPage=await visitor.newPage(),serverReads=(await readCodeRequests()).length;
  try{await publicPage.goto(origin+'/p/code-'+provider,{waitUntil:'networkidle'});await expect(publicPage.getByRole('link',{name:name+' link',exact:true})).toHaveCount(2);await expect(publicPage.locator('body')).not.toContainText('Owner review');await expect(publicPage.locator('body')).not.toContainText('pinned <script> line');assert.deepEqual(external,[]);assert.equal((await readCodeRequests()).length,serverReads);await accessible(publicPage,name+' published source links');}finally{await visitor.close();}
 }
 await switchIdentity('reader');
 for(const {pageId,name} of pages){await page.goto(origin+'/app/pages/'+pageId,{waitUntil:'networkidle'});await expect(page.getByRole('link',{name:'Connect to view',exact:true})).toHaveCount(2);await expect(page.locator('[data-page-editor]')).not.toContainText('Owner review');await expect(page.locator('[data-page-editor]')).not.toContainText('pinned <script> line');await accessible(page,name+' unlinked reader');}
 await switchIdentity('owner');await page.goto(origin+'/app/settings?section=portability#code-accounts',{waitUntil:'networkidle'});
 const settings=page.getByRole('region',{name:'Code host connections',exact:true});
 for(const {provider,name} of pages){await settings.getByRole('button',{name:'Disconnect '+name,exact:true}).click();await expect.poll(async()=> (await api('/api/embed-connections')).connections.find(connection=>connection.provider===provider)?.state).toBe('disconnected');await expect(settings.getByRole('button',{name:'Disconnect '+name,exact:true})).toBeDisabled();}
 await accessible(page,'Code accounts disconnected');
 for(const {pageId} of pages){await page.goto(origin+'/app/pages/'+pageId,{waitUntil:'networkidle'});await expect(page.getByRole('link',{name:'Connect to view',exact:true})).toHaveCount(2);await expect(page.locator('[data-page-editor]')).not.toContainText('Owner review');}
}
