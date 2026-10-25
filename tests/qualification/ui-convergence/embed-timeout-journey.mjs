import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {accessible} from './browser-evidence.mjs';
export async function embedTimeoutJourney(state){
 const {page,context,origin,api}=state,container=(await api('/api/containers')).items.find(s=>s.name==='Handbook');
 const block={id:randomUUID(),blockType:'link-card',content:{url:'https://vimeo.com/98765432',display:'embed',previewState:'ready',preview:{title:'Delayed planning video'}},treePosition:'00'};
 const {value:{pageId}}=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:container.id,title:'Delayed planning video',blocks:[block]});
 let held;
 const stall=async route=>{held=route;};
 await context.route('https://player.vimeo.com/**',stall);
 await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
 const card=page.locator(`[data-block-id="${block.id}"]`);
 await card.getByRole('button',{name:'Load Vimeo embed',exact:true}).click();
 // The product's eight-second deadline is observed against an unresponsive provider edge.
 await expect(card.getByRole('status')).toContainText('The provider does not allow embedding.',{timeout:10000});
 await expect(card.locator('iframe')).toHaveCount(0);
 await expect(card.getByRole('link',{name:block.content.url,exact:true})).toBeVisible();
 await held?.abort().catch(()=>{});await context.unroute('https://player.vimeo.com/**',stall);
 await accessible(page,'Timed out embed link card');
 const document=await api(`/api/pages/${pageId}`);
 await ok(context,origin,'POST',`/api/publishing/${pageId}`,{operationKey:randomUUID(),expectedRevisionId:document.page.revisionId,host:new URL(origin).host,slug:'delayed-planning-video'});
 const visitor=await context.browser().newContext({viewport:page.viewportSize()});let visitorHeld,requests=0;
 await visitor.route('https://player.vimeo.com/**',async route=>{requests++;visitorHeld=route;});
 const publicPage=await visitor.newPage();
 try{
  const serverReads=(await state.readEmbedRequests()).length;
  await publicPage.goto(origin+'/p/delayed-planning-video',{waitUntil:'networkidle'});assert.equal(requests,0);
  await publicPage.getByRole('button',{name:'Load Vimeo embed',exact:true}).click();
  await expect(publicPage.getByText('The provider does not allow embedding. Open the original link.')).toBeVisible({timeout:10000});
  await expect(publicPage.locator('iframe')).toHaveCount(0);assert.equal(requests,1);
  assert.equal((await state.readEmbedRequests()).length,serverReads);
  await visitorHeld?.abort().catch(()=>{});await accessible(publicPage,'Published timed out embed');
 }finally{await visitor.close();}
}
