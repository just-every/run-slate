import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {createPage} from '../interface/create-page.mjs';
import {call,ok,withSecondPerson} from './two-people-support.mjs';

/** Saved draft, named sharing and retained privacy through the native settings and page doors. */
export async function draftPrivacyJourney(state) {
  const {page,context,origin}=state,width=page.viewportSize().width;
  const directory=`.artifacts/ui-convergence/draft-privacy/${width}`;
  await mkdir(directory,{recursive:true});
  const original=await ok(context,origin,'GET','/api/workspace');
  const profile=async(lifecycle,access)=>{
    await page.goto(origin+'/app/settings',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Edit workspace & policies'}).click();
    await page.locator('select[name="page.lifecycle.v1"]').selectOption(lifecycle);
    await page.locator('select[name="page.access.v1"]').selectOption(access);
    await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const stored=await ok(context,origin,'GET','/api/workspace');
    assert.equal(stored.policies['page.lifecycle.v1'],lifecycle);assert.equal(stored.policies['page.access.v1'],access);
  };
  try {
    await profile('draft-then-publish','workspace-general');
    const containerId=(await ok(context,origin,'GET','/api/containers')).items.find(item=>item.name==='Handbook').id;
    const id=await createPage(page,origin,containerId,'Private response draft');
    const text='Only the named draft reviewers can read this response.';
    await page.getByRole('textbox',{name:'Page body',exact:true}).fill(text);
    await page.locator('.editor-save-status').filter({hasText:/^Saved$/}).waitFor();
    const read=()=>ok(context,origin,'GET',`/api/pages/${id}`);
    const grants=()=>ok(context,origin,'GET',`/api/sharing/pages/${id}`);
    const content=await read();assert.equal(content.page.lifecycle,'draft');assert.equal(content.publishedRevisionId,null);
    assert.deepEqual((await grants()).items,[]);
    await withSecondPerson(state,width,async people=>{
      assert.equal((await call(people.bob.context,origin,'GET',`/api/pages/${id}`)).status,404);
      await page.getByRole('button',{name:'Share',exact:true}).click();
      const panel=page.locator('.right');
      await panel.getByRole('button',{name:'Copy page link',exact:true}).click();
      const address=await page.evaluate(()=>navigator.clipboard.readText());
      assert.equal(address,`${origin}/app/pages/${id}`);
      assert.equal((await call(people.bob.context,origin,'GET',new URL(address).pathname.replace('/app/','/api/'))).status,404);
      await panel.getByText('Invite by email',{exact:true}).click();
      await panel.getByRole('textbox',{name:'Email address',exact:true}).fill(['reader','test.invalid'].join('@'));
      await panel.getByRole('button',{name:'Send invitation',exact:true}).click();
      await expect.poll(async()=>(await grants()).items.map(g=>[g.principalKind,g.principalId,g.level,g.status])).toEqual([['member','browser-reader','view','active']]);
      await page.reload({waitUntil:'networkidle'});
      await page.getByRole('button',{name:'Share',exact:true}).click();
      await expect(page.getByRole('combobox',{name:'Access for Morgan Reader',exact:true})).toHaveValue('view');
      await people.bob.page.goto(address,{waitUntil:'networkidle'});
      await expect(people.bob.page.locator('.page-document')).toContainText(text);
      assert.equal((await ok(people.bob.context,origin,'GET',`/api/pages/${id}`)).page.id,id);
      const retained={page:content.page,blocks:content.blocks,grants:(await grants()).items};
      await page.screenshot({path:`${directory}/saved-grant.png`,fullPage:true});
      await people.bob.page.screenshot({path:`${directory}/granted-reader.png`,fullPage:true});
      for(const [lifecycle,access] of [['always-live','container-general'],['draft-then-publish','workspace-general']]) {
        await profile(lifecycle,access);
        const doc=await read();assert.deepEqual(doc.page,retained.page);assert.deepEqual(doc.blocks,retained.blocks);assert.deepEqual((await grants()).items,retained.grants);
        await page.goto(address,{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});
        await expect(page.locator('.page-document')).toContainText(text);
        await people.bob.page.reload({waitUntil:'networkidle'});await expect(people.bob.page.locator('.page-document')).toContainText(text);
      }
      await page.getByRole('button',{name:'Share',exact:true}).click();
      const row=page.locator('.right .grant-list > li').filter({has:page.getByRole('combobox',{name:'Access for Morgan Reader',exact:true})});
      await row.locator('details > summary').click();await row.getByRole('button',{name:'Remove access',exact:true}).click();
      await expect.poll(async()=>(await grants()).items[0].status).toBe('revoked');
      assert.equal((await call(people.bob.context,origin,'GET',`/api/pages/${id}`)).status,404);
      await people.bob.page.reload({waitUntil:'networkidle'});await expect(people.bob.page.locator('.page-document')).not.toContainText(text);
      assert.deepEqual((await grants()).effectiveItems,[]);
      await page.screenshot({path:`${directory}/revoked-grant.png`,fullPage:true});
      await people.bob.page.screenshot({path:`${directory}/refused-reader.png`,fullPage:true});
    });
    console.log(`PROBE LIFE-002 browser ${width}: native draft creation and saved body -> link alone refused; address grant persisted; named reader read; profile switches retained draft; revoked session refused after reload`);
  } finally {
    await profile(original.policies['page.lifecycle.v1'],original.policies['page.access.v1']);
  }
}
