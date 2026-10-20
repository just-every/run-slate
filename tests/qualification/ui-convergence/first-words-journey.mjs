import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { openNavigation } from './browser-support.mjs';

/** What the server holds for the page's blocks, as plain text. */
const saved = async (api, pageId) => (await api(`/api/pages/${pageId}`)).blocks.map(block => (block.content.text ?? []).map(span => span.text).join(''));
const hydrated = locator => locator.evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps')));

async function createPage(page) {
  const previous = new URL(page.url()).pathname;
  await openNavigation(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menu', { name: 'Create content' }).getByRole('menuitem', { name: 'Page', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/app/pages/') && url.pathname !== previous, { waitUntil: 'commit' });
  return new URL(page.url()).pathname.split('/').at(-1);
}

/**
 * The first words typed with real keystrokes into a new page's empty first block are saved: on a
 * browser still loading the page's scripts (the server-rendered editor already accepts typing),
 * and when the writer leaves the page and returns at once.
 */
export async function firstWordsJourney(state) {
  const { page, api } = state;
  const editable = page.locator('[data-page-editor] [data-slate-editable]').first();
  const unfinished = 'First words typed before the page finished loading.';
  const slowScripts = async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue().catch(() => {}); };
  await page.route('**/*.js', slowScripts);
  let pageId;
  try {
    pageId = await createPage(page);
    const body = page.getByRole('textbox', { name: 'Page body', exact: true });
    await body.waitFor();
    assert.equal(await hydrated(body), false, 'The body is typed into before its scripts have attached.');
    await body.click();
    await page.keyboard.type(unfinished);
    await expect(editable).toHaveText(unfinished);
  } finally { await page.unroute('**/*.js', slowScripts); }
  await expect.poll(() => saved(api, pageId), { message: 'Words typed before hydration reach the server.' }).toEqual([unfinished]);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(editable).toHaveText(unfinished);

  const leaving = 'Words typed and left at once come back.';
  pageId = await createPage(page);
  const fresh = page.getByRole('textbox', { name: 'Page body', exact: true });
  await fresh.waitFor();
  await expect.poll(() => hydrated(fresh)).toBe(true);
  await fresh.click();
  await page.keyboard.type(leaving);
  await openNavigation(page);
  await page.locator('.navlink').filter({ hasText: /^Search/ }).first().click();
  await page.waitForURL(url => url.pathname === '/app/search');
  await page.goBack({ waitUntil: 'networkidle' });
  await expect.poll(() => saved(api, pageId), { message: 'Words typed just before leaving the page reach the server.' }).toEqual([leaving]);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(editable).toHaveText(leaving);
}
