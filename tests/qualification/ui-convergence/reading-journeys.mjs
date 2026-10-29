import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {call,ok} from './two-people-support.mjs';
import {guestConsoleJourney} from './guest-console-journey.mjs';
import { expect } from '@playwright/test';
import { accessible } from './browser-support.mjs';
import { compactPage } from './browser-evidence.mjs';
import {searchFiltersJourney} from './search-filters-journey.mjs';

export async function searchJourney(state, pageId) {
  const {page,origin,journeyTitle,searchTerm}=state;
  await page.goto(origin + '/app/search', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).not.toContainText(/A thought away\.|FIND SOMETHING WORTH KEEPING/);
  await page.getByRole('searchbox', { name: 'Search your workspace', exact: true }).fill(searchTerm);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const result = page.locator('.search-results a').filter({ has: page.getByRole('heading', { name: journeyTitle, exact: true }) });
  await expect(result).toBeVisible();
  await expect(result.locator('p')).toContainText('Second block: record the next action.');
  await expect(result.locator('p mark')).toContainText(searchTerm);
  await expect(result.locator('.eyebrow')).toHaveText('Page');
  const markColor = await result.locator('mark').first().evaluate(element => getComputedStyle(element).backgroundColor);
  assert.notEqual(markColor, 'rgb(255, 255, 0)', 'Search matches use the application highlight treatment.');
  await page.locator('.search-options summary').first().click();
  const archive = page.getByLabel('Include archive', { exact: true });
  await expect(archive).toBeVisible();
  const checkboxLayout = await archive.evaluate(element => { const label = element.closest('label'); return { display: getComputedStyle(label).display, gap: parseFloat(getComputedStyle(label).gap), height: label.getBoundingClientRect().height }; });
  assert.ok(['flex', 'inline-flex'].includes(checkboxLayout.display) && checkboxLayout.gap >= 4, 'Archive checkbox is separated and styled.');
  const saveSearch = await page.getByRole('button', { name: 'Save this search', exact: true }).boundingBox();
  assert.ok(saveSearch && saveSearch.height >= 32, 'Save search has a button affordance.');
  const searchLayout = await page.evaluate(() => ({
    input: document.querySelector('.search-form').getBoundingClientRect().bottom,
    result: document.querySelector('.search-results').getBoundingClientRect().top,
    options: document.querySelector('.search-options').getBoundingClientRect().top,
  }));
  assert.ok(searchLayout.result >= searchLayout.input && searchLayout.result < searchLayout.options, 'Results follow the search input before options disclosures.');
  await accessible(page, 'search results');
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/app/pages/${pageId}\\?`));
  await expect(page.getByRole('status').filter({ hasText: /Matches highlighted/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => CSS.highlights.get('search-match')?.size ?? 0)).toBeGreaterThan(0);
  await compactPage(page);
  await accessible(page, 'opened search match');
  await page.getByRole('button', { name: 'Clear highlights', exact: true }).click();
  await expect(page.locator('[data-search-context]')).toHaveCount(0);
  await page.goBack({ waitUntil: 'networkidle' });
  await expect(page.getByRole('searchbox', { name: 'Search your workspace', exact: true })).toHaveValue(searchTerm);
  assert.equal(new URL(page.url()).searchParams.get('q'), searchTerm);
  await expect(result).toBeVisible();
  await accessible(page, 'search Back preserves query');
  await page.getByRole('searchbox', { name: 'Search your workspace', exact: true }).fill(`nomatches${searchTerm}`);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.search-empty')).toContainText('Filters: None');
  await expect(page.getByRole('button', { name: 'Clear all filters', exact: true })).toHaveCount(0);
  const create = page.getByRole('button', { name: /Create a page titled/ });
  assert.ok(await create.evaluate(element => element.classList.contains('primary-button')));
  await accessible(page, 'search no match');
  await searchFiltersJourney(state);
}

export async function settingsJourney(state, width) {
  const {page,origin}=state;
  await page.goto(origin + '/app/settings', { waitUntil: 'networkidle' });
  const tabs = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Workspace', exact: true })).toHaveAttribute('aria-current', 'page');
  const headingLayout = await page.locator('.settings-panel').evaluate(panel => {
    // The ad-hoc eyebrow above the heading is gone (one shared header system); the heading still sits clear of the line after it.
    const heading = panel.querySelector('h2').getBoundingClientRect();
    const content = panel.querySelector('h3').getBoundingClientRect();
    return heading.bottom <= content.top;
  });
  assert.ok(headingLayout, 'Settings heading and adjacent lines do not overlap.');
  if (width === 390) {
    const lines = await tabs.locator('a').evaluateAll(elements => new Set(elements.map(element => Math.round(element.getBoundingClientRect().top))).size);
    assert.ok(lines <= 2, 'Mobile settings navigation avoids a four-row tab wall.');
  }
  await accessible(page, 'workspace settings');
  await tabs.getByRole('link', { name: 'Workspace', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(tabs.getByRole('link', { name: 'People', exact: true })).toBeFocused();
  const focusStyle = await tabs.getByRole('link', { name: 'People', exact: true }).evaluate(element => ({
    width: parseFloat(getComputedStyle(element).outlineWidth), style: getComputedStyle(element).outlineStyle,
  }));
  assert.ok(focusStyle.width > 0 && focusStyle.style !== 'none', 'Settings keyboard focus is visible.');
  await tabs.getByRole('link', { name: 'Spaces', exact: true }).click();
  await expect(tabs.getByRole('link', { name: 'Spaces', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.spaces-workspace').getByRole('heading', { name: 'Spaces', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\bContainers?\b/);
  await accessible(page, 'space settings');
  await retainedActivityJourney(state, width);
  await guestConsoleJourney(state);
}

/** Native erasure leaves a readable explanation, bounded by current access. */
export async function retainedActivityJourney(state, width) {
  const {page,context,origin,api}=state;
  const title='Activity erasure source',content='synthetic-slate-1402';
  const space=(await api('/api/containers')).items.find(item=>item.name==='Handbook');
  const write={operationKey:randomUUID(),containerId:space.id,title,blocks:[{id:randomUUID(),blockType:'paragraph',treePosition:'0',content:{text:[{text:content}]}}]};
  const created=await ok(context,origin,'POST','/api/pages',write),pageId=created.value.pageId;
  const document=await api(`/api/pages/${pageId}`);
  if(document.page.lifecycle==='draft')await ok(context,origin,'POST',`/api/pages/${pageId}/publish`,{operationKey:randomUUID(),expectedRevisionId:document.page.revisionId});
  const before=(await api('/api/activity?kind=page')).items.find(item=>item.target.id===pageId&&item.action==='pages.create');
  assert.ok(before,'The native page commit has a populated activity entry.');
  const grant=await ok(context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'container',targetId:space.id,principalKind:'member',principalId:'browser-reader',level:'view'});
  await ok(context,origin,'POST',`/api/archive/${pageId}`,{operationKey:randomUUID(),expectedRevisionId:(await api(`/api/pages/${pageId}`)).page.revisionId,action:'trash'});
  await page.goto(origin+'/app/archive',{waitUntil:'networkidle'});
  await page.getByRole('group',{name:'Archive and trash'}).getByRole('button',{name:'Trash',exact:true}).click();
  await page.locator('.archive-list li').filter({has:page.getByRole('heading',{name:title,exact:true})}).getByRole('button',{name:'Delete permanently',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:`Permanently delete ${title}?`,exact:true});
  await dialog.getByLabel('Type the page title').fill(title);
  const committed=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/archive/${pageId}/permanent-delete`&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'Delete permanently',exact:true}).click();
  const receipt=await committed;
  assert.equal(receipt.status(),200,await receipt.text());
  await expect(dialog).toBeHidden();
  await page.goto(origin+'/app/settings?section=activity',{waitUntil:'networkidle'});
  await page.locator('select[name=kind]').selectOption('page');
  await page.getByLabel('Action',{exact:true}).fill('pages.create');
  await page.getByRole('button',{name:'Filter activity',exact:true}).click();
  const row=page.locator(`[data-activity-id="${before.id}"]`);
  await expect(row).toBeVisible();
  if(width===1440){
    const retained=(await api('/api/activity?kind=page')).items.find(item=>item.id===before.id);
    assert.deepEqual(retained.target,before.target);
    assert.equal(retained.occurredAt,before.occurredAt);
    assert.equal(retained.deleted,true);
    assert.equal(retained.actor,null);
    assert.deepEqual(retained.context,{});
    assert.ok(!JSON.stringify(retained).includes(title)&&!JSON.stringify(retained).includes(content));
    await expect(row.locator('.activity-target')).toHaveText(`${before.target.kind} · Reference ${pageId}`);
    await expect(row.locator('time')).toHaveAttribute('datetime',before.occurredAt);
    await expect(row.locator('time')).toHaveText(new Date(before.occurredAt).toLocaleString('en-US'));
    await expect(row).toContainText('Item no longer available');
    await expect(row.getByRole('link')).toHaveCount(0);
    await expect(page.locator('.settings-panel')).not.toContainText(title);
    await expect(page.locator('.settings-panel')).not.toContainText(content);
    const replay=await call(context,origin,'POST','/api/pages',write);
    assert.equal(replay.status,200);
    assert.ok(!JSON.stringify(replay.body).includes(title)&&!JSON.stringify(replay.body).includes(content));
    const tombstone=await call(context,origin,'GET',`/api/pages/${pageId}`);
    assert.ok(!JSON.stringify(tombstone.body).includes(title)&&!JSON.stringify(tombstone.body).includes(content));
  }
  await accessible(page,'retained erased activity');
  const reader=await context.browser().newContext({viewport:page.viewportSize(),locale:'en-US'});
  try{
    await reader.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:origin}]);
    const readerPage=await reader.newPage();
    await readerPage.goto(origin+'/app/settings?section=activity',{waitUntil:'networkidle'});
    await expect(readerPage.locator(`[data-activity-id="${before.id}"]`)).toBeVisible();
    await ok(context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'container',targetId:space.id,id:grant.value.id,principalKind:'member',principalId:'browser-reader',level:'view',revoke:true});
    await readerPage.reload({waitUntil:'networkidle'});
    if(width===1440){
      const refused=await ok(reader,origin,'GET','/api/activity?kind=page');
      assert.ok(!refused.items.some(item=>item.target.id===pageId));
      await expect(readerPage.locator(`[data-activity-id="${before.id}"]`)).toHaveCount(0);
      await expect(readerPage.locator('.settings-panel')).not.toContainText(pageId);
      assert.equal((await call(reader,origin,'GET',`/api/pages/${pageId}`)).status,404);
    }
    await accessible(readerPage,'revoked erased activity');
  }finally{await reader.close();}
}
