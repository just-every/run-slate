import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';

const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" fill="#265e80"/></svg>';

/** An ordinary editor inserts every native media kind, then reads the committed page again. */
export async function mediaBlocksJourney(state) {
  const {page,context,origin,api}=state, width=page.viewportSize().width;
  const receipts=[],matrix=[];
  const fixtures=[
    {kind:'image',label:'Image',name:'synthetic-slate-image.svg',type:'image/svg+xml',buffer:Buffer.from(svg)},
    {kind:'video',label:'Video',name:'synthetic-slate-video.mp4',type:'video/mp4',buffer:await readFile(new URL('../../fixtures/media/synthetic-slate.mp4',import.meta.url))},
    {kind:'audio',label:'Audio',name:'synthetic-slate-audio.mp3',type:'audio/mpeg',buffer:await readFile(new URL('../../fixtures/media/synthetic-slate.mp3',import.meta.url))},
    {kind:'file',label:'File attachment',name:'synthetic-slate-file.txt',type:'text/plain',buffer:Buffer.from('synthetic-slate-attachment')},
  ];
  const linked='https://media.example.test/';
  // The only network fake is the linked host: the native editor and stored uploads stay real.
  const edge=async route=>{
    const fixture=fixtures.find(f=>route.request().url()===linked+f.name);
    assert.ok(fixture,'Only the selected linked fixture may be requested.');
    await route.fulfill({status:200,contentType:fixture.type,headers:{'content-disposition':'inline','x-content-type-options':'nosniff'},body:fixture.buffer});
  };
  await context.route(linked+'**',edge);
  await state.switchIdentity('reader');
  try {
    const space=(await ok(context,origin,'POST','/api/containers',{operationKey:randomUUID(),name:'Media field notes',visibility:'private'})).value;
    const pageId=(await ok(context,origin,'POST',`/api/blog/containers/${space.id}/posts`,{operationKey:randomUUID(),title:'Media field notes'})).value.pageId;
    await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
    for(const mode of ['upload','link']) for(const fixture of fixtures) {
      console.log(`MEDIA_INSERT width=${width} kind=${fixture.kind} mode=${mode}`);
      const before=new Set((await api(`/api/pages/${pageId}`)).blocks.map(b=>b.id));
      await page.getByRole('button',{name:/Add block/}).click();
      await page.getByRole('option',{name:fixture.label,exact:true}).click();
      const block=page.locator('[data-page-editor] [data-block-id]').last();
      await block.getByRole('button',{name:mode==='upload'?'Upload':'Add a link',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:mode==='upload'?'Add a file':'Add a media link',exact:true});
      if(mode==='upload') {
        await dialog.getByLabel('File',{exact:true}).setInputFiles({name:fixture.name,mimeType:fixture.type,buffer:fixture.buffer});
        const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/media'&&r.request().method()==='POST');
        await dialog.getByRole('button',{name:'Upload file',exact:true}).click();
        const uploaded=await response;assert.equal(uploaded.status(),200);
        receipts.push({kind:fixture.kind,mode,status:uploaded.status(),value:(await uploaded.json()).value});
      } else {
        await dialog.getByLabel('Media link',{exact:true}).fill(linked+fixture.name);
        await dialog.getByLabel('Display name',{exact:true}).fill('Linked '+fixture.label);
        await dialog.getByRole('button',{name:'Use link',exact:true}).click();
      }
      await expect(dialog).not.toBeVisible();
      const caption=`${fixture.label} ${mode} caption`,alt=`${fixture.label} ${mode} description`;
      await block.getByRole('textbox',{name:`${fixture.label} caption`,exact:true}).fill(caption);
      await block.getByRole('textbox',{name:'Alt text',exact:true}).fill(alt);
      await block.getByRole('textbox',{name:'Alt text',exact:true}).press('Tab');
      await expect.poll(async()=>{
        const doc=await api(`/api/pages/${pageId}`);
        return doc.blocks.some(b=>!before.has(b.id)&&b.blockType==='media'&&b.content.kind===fixture.kind&&b.content.caption===caption&&b.content.alt===alt&&b.content.source?.url);
      }).toBeTruthy();
      const saved=(await api(`/api/pages/${pageId}`)).blocks.find(b=>!before.has(b.id)&&b.blockType==='media');
      assert.ok(saved);receipts.push({kind:fixture.kind,mode,blockId:saved.id,caption:saved.content.caption,alt:saved.content.alt,source:saved.content.source});
      if(width===1440) {
        if(fixture.kind==='image') await expect(block.getByRole('img',{name:alt,exact:true})).toBeVisible();
        if(fixture.kind==='video'||fixture.kind==='audio') await expect(block.locator(fixture.kind)).toHaveAttribute('aria-label',alt);
        if(fixture.kind==='file') await expect(block.getByRole('button',{name:'Download',exact:true})).toBeVisible();
      }
    }
    for(const kind of ['icon','cover']) {
      await page.getByRole('button',{name:'More',exact:true}).click();
      await page.getByRole('menuitem',{name:`Add ${kind}`,exact:true}).click();
      const dialog=page.getByRole('dialog',{name:`Page ${kind}`,exact:true});
      await dialog.getByLabel(kind==='icon'?'Icon source':'Cover source',{exact:true}).selectOption('upload');
      await dialog.getByLabel('Image',{exact:true}).setInputFiles({name:`synthetic-slate-${kind}.svg`,mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
      await dialog.getByRole('button',{name:'Save appearance',exact:true}).click();
      await expect(dialog).not.toBeVisible();
    }
    await page.reload({waitUntil:'networkidle'});
    const doc=await api(`/api/pages/${pageId}`), stored=doc.blocks.filter(b=>b.blockType==='media');
    assert.equal(stored.length,8);
    for(const block of stored) {
      const row=page.locator(`[data-page-editor] [data-block-id="${block.id}"]`);
      if(width===1440) {
        await expect(row.getByRole('textbox',{name:'Alt text',exact:true})).toHaveValue(block.content.alt);
        await expect(row.locator('figcaption')).toHaveText(block.content.caption);
        if(block.content.kind==='image') await expect.poll(()=>row.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
        if(['video','audio'].includes(block.content.kind)) await expect.poll(()=>row.locator(block.content.kind).evaluate(media=>media.readyState)).toBeGreaterThan(0);
      }
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({path:`.artifacts/ui-convergence/media-${width}-${block.content.kind}-${block.content.source.fileId?'upload':'link'}.png`});
    }
    for(const kind of ['icon','cover']) {
      const image=page.locator('.page-appearance').getByRole('img',{name:`Page ${kind}`,exact:true});
      await expect(image).toBeVisible();
      assert.equal(await image.evaluate(img=>img.complete&&img.naturalWidth>0),true);
      const response=await context.request.get(origin+await image.getAttribute('src'));
      assert.equal(response.status(),200);assert.match(response.headers()['content-disposition'],/^inline;/);
      matrix.push({audience:'member',kind,status:response.status(),headers:response.headers()});
    }
    await page.locator('.page-appearance').scrollIntoViewIfNeeded();
    await page.screenshot({path:`.artifacts/ui-convergence/media-${width}-appearance.png`});
    const slug=`media-${width}`;
    await ok(context,origin,'POST',`/api/publishing/${pageId}`,{operationKey:randomUUID(),expectedRevisionId:doc.page.revisionId,host:new URL(origin).host,slug});
    const visitor=await context.browser().newContext({viewport:page.viewportSize()});
    try {
      const view=await visitor.newPage();
      await view.goto(`${origin}/p/${slug}`,{waitUntil:'networkidle'});
      for(const selector of ['.page-cover','.page-icon img']) {
        const image=view.locator(selector);
        assert.equal(await image.evaluate(img=>img.complete&&img.naturalWidth>0),true);
        const response=await visitor.request.get(origin+await image.getAttribute('src'));
        assert.equal(response.status(),200);assert.match(response.headers()['content-disposition'],/^inline;/);
        matrix.push({audience:'public',kind:selector,status:response.status(),headers:response.headers()});
      }
      for(const f of fixtures) {
        const uploaded=stored.find(b=>b.content.kind===f.kind&&b.content.source.fileId);
        if(width===1440) await expect(view.locator('figcaption').filter({hasText:uploaded.content.caption})).toBeVisible();
      }
      await view.screenshot({path:`.artifacts/ui-convergence/media-${width}-public.png`});
    } finally {await visitor.close();}
    await page.goto(`${origin}/app/containers/${space.id}`,{waitUntil:'networkidle'});
    await page.getByRole('navigation',{name:'Space navigation'}).getByRole('button',{name:'Blog',exact:true}).click();
    const cover=page.getByRole('region',{name:'Blog',exact:true}).getByRole('article',{name:'Media field notes',exact:true}).locator('img.post-cover');
    await expect(cover).toBeVisible();
    assert.equal(await cover.evaluate(image=>image.complete&&image.naturalWidth>0),true);
    const coverResponse=await context.request.get(origin+await cover.getAttribute('src'));
    assert.equal(coverResponse.status(),200);assert.match(coverResponse.headers()['content-disposition'],/^inline;/);
    matrix.push({audience:'blog',kind:'cover',status:coverResponse.status(),headers:coverResponse.headers()});
    await page.screenshot({path:`.artifacts/ui-convergence/media-${width}-blog.png`});
    await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
    const buttons=page.locator('[data-page-editor] button[aria-label]');
    if(width===1440) {
      for(const button of await buttons.all()) {
        if(await button.locator('svg').count() && !(await button.innerText()).trim()) assert.ok(await button.getAttribute('data-tooltip'),'Editor icon controls explain themselves.');
      }
    }
    await writeFile(`.artifacts/ui-convergence/media-${width}-receipt.json`,JSON.stringify({width,pageId,receipts,matrix,stock:'unproved: owner provider key not held'},null,2));
    console.log(`MEDIA_NATIVE_JOURNEY width=${width} inserted=8 captions=8 alt=8 reload=passed appearance=inline public=inline`);
  } finally {await context.unroute(linked+'**',edge);await state.switchIdentity('owner');}
}
