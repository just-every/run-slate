import {codeCardsJourney} from './code-cards-journey.mjs';
import {embedTimeoutJourney} from './embed-timeout-journey.mjs';
import {accessible} from './browser-evidence.mjs';
import {fileCardsJourney} from './file-cards-journey.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';

export async function providerEmbedsJourney(state) {
  const {page,context,origin,api}=state;
  const space=(await api('/api/containers')).items.find(s=>s.name==='Handbook');
  const providers=[['Figma','https://www.figma.com/design/Abc123/Plan'],['Miro','https://miro.com/app/board/uXjTest=/'],['Lucid','https://lucid.app/documents/embedded/abcd-1234'],['Loom','https://www.loom.com/share/abcd1234'],['YouTube','https://www.youtube.com/watch?v=dQw4w9WgXcQ'],['Vimeo','https://vimeo.com/12345678'],['Google Docs','https://docs.google.com/document/d/abc123/edit'],['Google Sheets','https://docs.google.com/spreadsheets/d/def123/edit'],['Google Slides','https://docs.google.com/presentation/d/ghi123/edit'],['Microsoft 365','https://onedrive.live.com/embed?resid=123'],['Lucid','https://www.lucidchart.com/documents/embedded/refused-1234'],['Microsoft 365','https://synthetic-slate-204.sharepoint.com/sites/wiki/_layouts/15/Doc.aspx?sourcedoc=abc&action=embedview']];
  const loaded=[];
  // This is the network edge only: each provider serves a deterministic embedded document.
  await context.route(url=>url.origin!==origin,async route=>{
    loaded.push(route.request().url());
    await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><h1>Planning document</h1><p>Recorded provider boundary: launch milestones and owners.</p></body></html>'});
  });
  const blocks=providers.map(([name,url],i)=>({id:randomUUID(),blockType:'link-card',content:{url,display:'card',previewState:'ready',preview:{title:name+' planning reference'}},treePosition:String(i).padStart(2,'0')}));
  const {value:{pageId}}=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:space.id,title:'Launch planning references',blocks});
  await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
  assert.equal(loaded.length,0);
  for(let i=0;i<providers.length;i++) {
    const [name]=providers[i], block=page.locator(`[data-block-id="${blocks[i].id}"]`);
    await block.getByRole('button',{name:'Embed',exact:true}).click();
    if(i>=10){
      await expect(block.getByRole('status')).toContainText('The provider does not allow embedding.');
      await expect(block.locator('iframe')).toHaveCount(0);
      await expect(block.getByRole('link',{name:providers[i][1],exact:true})).toBeVisible();
      continue;
    }
    await expect(block.getByRole('button',{name:`Load ${name} embed`,exact:true})).toBeVisible();
    const before=loaded.length;
    await block.getByRole('button',{name:`Load ${name} embed`,exact:true}).click();
    await expect.poll(()=>loaded.length).toBe(before+1);
    const outer=block.frameLocator(`iframe[title="${name} embed"]`);
    await expect(outer.frameLocator('iframe').getByRole('heading',{name:'Planning document'})).toBeVisible();
    assert.match(await outer.locator('iframe').getAttribute('sandbox'),/allow-scripts/);
    if(i===0)await page.screenshot({path:`.artifacts/ui-convergence/embeds-${page.viewportSize().width}-loaded.png`});
    await block.getByRole('button',{name:'Show link instead',exact:true}).click();
    await expect(block.locator('iframe')).toHaveCount(0);
  }
  await accessible(page,'Provider refusal link cards');
  await expect.poll(async()=> (await api(`/api/pages/${pageId}`)).blocks.every(b=>b.content.display==='embed')).toBe(true);
  const document=await api(`/api/pages/${pageId}`);
  await ok(context,origin,'POST',`/api/publishing/${pageId}`,{operationKey:randomUUID(),expectedRevisionId:document.page.revisionId,host:new URL(origin).host,slug:'planning-references'});
  const publicContext=await context.browser().newContext({viewport:page.viewportSize()});
  const external=[];
  await publicContext.route(url=>url.origin!==origin,async route=>{external.push(route.request().url());await route.fulfill({status:200,contentType:'text/html',body:'<h1>Shared planning document</h1>'});});
  const publicPage=await publicContext.newPage();
  try {
    const beforeVisitorReads=(await state.readEmbedRequests()).length;
    await publicPage.goto(origin+'/p/planning-references',{waitUntil:'networkidle'});
    assert.deepEqual(external,[]);
    assert.equal((await state.readEmbedRequests()).length,beforeVisitorReads);
    assert.deepEqual(await publicContext.cookies(),[]);
    await publicPage.screenshot({path:`.artifacts/ui-convergence/embeds-${page.viewportSize().width}-public-before.png`});
    await expect(publicPage.getByText('The provider does not allow embedding. Open the original link.')).toHaveCount(2);
    await expect(publicPage.getByRole('button',{name:'Load Microsoft 365 embed',exact:true})).toHaveCount(1);
    await expect(publicPage.getByRole('button',{name:'Load Lucid embed',exact:true})).toHaveCount(1);
    const serverReads=(await state.readEmbedRequests()).length;
    await accessible(publicPage,'Published refusal link cards');
    await publicPage.getByRole('button',{name:'Load Figma embed',exact:true}).click();
    await expect(publicPage.frameLocator('iframe[title="Figma embed"]').frameLocator('iframe').getByRole('heading',{name:'Shared planning document'})).toBeVisible();
    assert.equal(external.length,1);
    assert.equal((await state.readEmbedRequests()).length,serverReads);
    await publicPage.screenshot({path:`.artifacts/ui-convergence/embeds-${page.viewportSize().width}-public-loaded.png`});
  } finally {await publicContext.close();}
  await embedTimeoutJourney(state);
  await fileCardsJourney(state);
  await codeCardsJourney(state);
}
