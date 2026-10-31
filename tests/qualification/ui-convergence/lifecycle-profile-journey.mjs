import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {root} from '../../e2e/runtime-harness.mjs';
import {createPage} from '../interface/create-page.mjs';
import {publicationChecks} from '../interface/publication.mjs';
import {call,grant,ok,restrictedPage} from './two-people-support.mjs';

/** Both lifecycle profiles use real settings, pages, grants and publication. */
export async function lifecycleProfileJourney(state,people) {
  const {page,context,origin}=state;
  const initial=await state.api('/api/workspace');
  const width=page.viewportSize().width;
  const directory=path.join(root,'.artifacts/ui-convergence/lifecycle-profile',String(width));
  await mkdir(directory,{recursive:true});
  const get=id=>state.api(`/api/pages/${id}`);
  const open=async id=>{await page.goto(`${origin}/app/pages/${id}`,{waitUntil:'networkidle'});await expect(page.getByRole('textbox',{name:'Page title',exact:true})).toBeVisible();};
  const settings=async(lifecycle,version='labelled')=>{
    await page.goto(origin+'/app/settings',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Edit workspace & policies'}).click();
    await page.locator('select[name="page.lifecycle.v1"]').selectOption(lifecycle);
    await page.locator('select[name="page.version.v1"]').selectOption(version);
    await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    assert.equal((await state.api('/api/workspace')).policies['page.lifecycle.v1'],lifecycle);
  };
  const publish=async id=>ok(context,origin,'POST',`/api/pages/${id}/publish`,{operationKey:crypto.randomUUID(),expectedRevisionId:(await get(id)).page.revisionId,label:'Retained release'});
  const snapshot=async ids=>Promise.all(ids.map(async id=>{
    const {policyProfile,...document}=await get(id);
    const revisions=await state.api(`/api/revisions/${id}`);
    const bodies=await Promise.all(revisions.items.map(r=>state.api(`/api/revisions/${id}/${r.id}`)));
    return {document,revisions,bodies,grants:await state.api(`/api/sharing/pages/${id}`)};
  }));
  const inventories=[];
  const inventory=async(id,lifecycle,storedState)=>{
    await open(id);
    const controls=lifecycle==='draft-then-publish';
    await expect(page.locator('.page-document > .draft-label').filter({hasText:'Private draft'})).toHaveCount(controls&&storedState==='draft'?1:0);
    await expect(page.getByRole('status').filter({hasText:/^Unpublished changes\./})).toHaveCount(controls&&storedState==='live-with-unpublished-changes'?1:0);
    await expect(page.getByRole('status').filter({hasText:/^Scheduled for /})).toHaveCount(controls&&storedState==='scheduled'?1:0);
    const navigation=page.getByRole('button',{name:'Open navigation',exact:true});
    if(await navigation.isVisible())await navigation.click();
    const tree=page.locator(`.page-tree a[href="/app/pages/${id}"]`);
    await expect(tree).toBeVisible();
    await tree.scrollIntoViewIfNeeded();
    await expect(tree.locator('.draft-chip')).toHaveCount(controls&&storedState==='draft'?1:0);
    await expect(tree.locator('.scheduled-publication')).toHaveCount(controls&&storedState==='scheduled'?1:0);
    await page.screenshot({path:path.join(directory,`${lifecycle}-${storedState}-tree.png`),fullPage:true});
    const closeNavigation=page.locator('.mobile-bar').getByRole('button',{name:'Close navigation',exact:true});
    if(await closeNavigation.isVisible())await closeNavigation.click();
    await page.getByRole('button',{name:'More',exact:true}).click();
    const expected=[...(controls?['Publish workspace revision']:[]),...(controls&&storedState==='draft'?['Close draft','Discard draft']:[]),...(controls&&storedState==='scheduled'?['Cancel scheduled publication']:[]),...(controls&&storedState==='live-with-unpublished-changes'?['Discard unpublished changes']:[])];
    const names=['Publish workspace revision','Close draft','Discard draft','Cancel scheduled publication','Discard unpublished changes'];
    for(const name of names)await expect(page.getByRole('menuitem',{name,exact:true})).toHaveCount(expected.includes(name)?1:0);
    inventories.push({lifecycle,storedState,controls:expected});
    await page.getByRole('menuitem',{name:expected[0]??'Archive page',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(directory,`${lifecycle}-${storedState}-controls.png`),fullPage:true});
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog',{name:'Publish this revision',exact:true})).toHaveCount(0);
    await expect(page.getByLabel('Publish as',{exact:true})).toHaveCount(0);
    await expect(page.locator('input[name="label"]')).toHaveCount(0);
  };
  try {
    await settings('always-live');
    const {pageId:live,spaceId}=await restrictedPage(state,'Always live field guide',['Shared live body']);
    assert.equal((await get(live)).page.lifecycle,'live');
    assert.equal((await get(live)).workingRevisionId,(await get(live)).publishedRevisionId);
    assert.equal((await call(people.bob.context,origin,'GET',`/api/pages/${live}`)).status,404);
    await open(live);
    await page.getByRole('button',{name:'Share',exact:true}).click();
    const panel=page.locator('aside.right');
    await panel.getByRole('combobox',{name:'Invite someone',exact:true}).selectOption('member:browser-reader');
    await panel.getByRole('combobox',{name:'Permission',exact:true}).selectOption('view');
    await panel.getByRole('button',{name:'Share page',exact:true}).click();
    await expect(panel.getByRole('combobox',{name:'Access for Morgan Reader',exact:true})).toBeVisible();
    assert.equal((await call(people.bob.context,origin,'GET',`/api/pages/${live}`)).status,200);
    await inventory(live,'always-live','live');
    // Labelled versions must not re-enable publication in always-live.
    await settings('draft-then-publish');
    const draft=await createPage(page,origin,spaceId,'Private profile draft');
    await expect(page.locator('.page-document > .draft-label')).toHaveText('Private draft');
    assert.equal((await get(draft)).page.lifecycle,'draft');
    assert.ok(!(await ok(people.bob.context,origin,'GET','/api/pages')).items.some(p=>p.id===draft));
    await people.bob.page.goto(origin+'/app',{waitUntil:'networkidle'});
    await expect(people.bob.page.locator(`.page-tree a[href="/app/pages/${draft}"]`)).toHaveCount(0);
    const {pageId:scheduled}=await restrictedPage(state,'Scheduled profile guide',['Scheduled body']);
    await ok(context,origin,'POST',`/api/pages/${scheduled}/publish`,{operationKey:crypto.randomUUID(),expectedRevisionId:(await get(scheduled)).page.revisionId,publishAt:'2099-04-10T12:00:00.000Z'});
    const {pageId:changed}=await restrictedPage(state,'Changed profile guide',['Published body']);
    await publish(changed);
    await grant(context,origin,changed,people.bob.id,'view');
    await ok(context,origin,'PATCH',`/api/pages/${changed}`,{operationKey:crypto.randomUUID(),expectedRevisionId:(await get(changed)).page.revisionId,properties:{title:'Unpublished profile guide'}});
    await ok(context,origin,'PUT','/api/navigation/favourites',{operationKey:crypto.randomUUID(),kind:'page',id:scheduled,enabled:true});
    const ids=[live,draft,scheduled,changed];
    const before=await snapshot(ids);
    for(const lifecycle of ['draft-then-publish','always-live','draft-then-publish']) {
      await settings(lifecycle);
      for(const [id,storedState] of [[live,'live'],[draft,'draft'],[scheduled,'scheduled'],[changed,'live-with-unpublished-changes']])await inventory(id,lifecycle,storedState);
      await page.goto(origin+'/app',{waitUntil:'networkidle'});
      const scheduleTimes=page.locator(`.personal-home a[href="/app/pages/${scheduled}"] .scheduled-publication`);
      await expect(scheduleTimes).toHaveCount(lifecycle==='draft-then-publish'?2:0);
      await page.screenshot({path:path.join(directory,`${lifecycle}-home.png`),fullPage:true});
      assert.deepEqual(await snapshot(ids),before,'Settings and visible controls change no stored page, schedule, immutable revision or grant.');
      assert.equal((await call(people.bob.context,origin,'GET',`/api/pages/${draft}`)).status,404);
      assert.equal((await call(people.bob.context,origin,'GET',`/api/pages/${scheduled}`)).status,404);
    }
    await open(draft);
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.getByRole('menuitem',{name:'Close draft',exact:true}).click();
    await page.waitForURL(url=>url.pathname==='/app');
    assert.deepEqual(await snapshot(ids),before,'Closing keeps the complete draft.');
    await open(draft);
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.getByRole('menuitem',{name:'Discard draft',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
    await page.waitForURL(url=>url.pathname==='/app');
    assert.equal((await call(context,origin,'GET',`/api/pages/${draft}`)).status,404);
    await page.goto(origin+'/app/archive',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Trash',exact:true}).click();
    await expect(page.getByText('Private profile draft',{exact:true})).toBeVisible();
    // Retain every existing publication, schedule and discard assertion at both widths.
    const welcome=(await state.api('/api/pages')).items.find(p=>p.title==='Welcome');
    await ok(context,origin,'POST','/api/sharing',{operationKey:crypto.randomUUID(),targetKind:'container',targetId:welcome.containerId,principalKind:'member',principalId:people.bob.id,level:'view'});
    await publicationChecks({page,context,runtime:{origin,directory},id:welcome.id,reader:people.bob,check:()=>{}});
    await settings('draft-then-publish','autosnapshot');
    await open(live);
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.getByRole('menuitem',{name:'Publish workspace revision',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Publish this revision',exact:true});
    await expect(dialog.locator('input[name="label"]')).toHaveCount(0);
    await expect(dialog.getByLabel('Publish as',{exact:true})).toBeVisible();
    await expect(dialog.getByLabel('Schedule (optional)',{exact:true})).toBeVisible();
    await page.screenshot({path:path.join(directory,'draft-profile-autosnapshot-publication.png'),fullPage:true});
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await writeFile(path.join(directory,'profiles.json'),JSON.stringify({width,inventories,before,after:await snapshot([live,scheduled,changed])},null,2));
    console.log(`PROBE LIFE-006 1-4: ${width}px settings, creation, share, publication, schedule, close and discard -> exact controls and unchanged retained states, revisions and grants`);
  } finally {
    await settings(initial.policies['page.lifecycle.v1'],initial.policies['page.version.v1']);
  }
}
