import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible, openNavigation } from './browser-support.mjs';
import { ok } from './two-people-support.mjs';

const keyboardKeys = [
  'Ctrl K or ⌘ K', 'Ctrl / or ⌘ /', 'Esc',
  'Alt Shift ↓', 'Alt Shift ↑', 'Alt Shift →', 'Alt Shift ←',
  'Ctrl B or ⌘ B', 'Ctrl I or ⌘ I', 'Ctrl U or ⌘ U',
  '→ or Page Down', '← or Page Up',
];

/** The same reference opens throughout the operator app and leaves the writer's work intact. */
export async function shortcutReferenceJourney(state) {
  const { page, context, origin, api } = state;
  const width = page.viewportSize().width;
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const blockId = randomUUID(), text = 'synthetic-slate-reference';
  const created = await ok(context, origin, 'POST', '/api/pages', {
    operationKey: randomUUID(), containerId: space.id, title: 'Keyboard reference editing',
    blocks: [{ id: blockId, blockType: 'paragraph', content: { text: [{ text }] }, treePosition: 'a' }],
  });
  const pageId = created.value.pageId;
  const database = await ok(context, origin, 'POST', '/api/databases', { operationKey: randomUUID(), containerId: space.id, title: 'Keyboard reference records' });
  const record = await ok(context, origin, 'POST', `/api/databases/${database.value.id}/records`, { operationKey: randomUUID(), title: 'Keyboard reference record', values: {} });
  const navigation = await api('/api/navigation/configuration');
  await page.goto(origin + '/app/settings', { waitUntil: 'networkidle' });
  const settings = await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')));
  const destinations = [...new Set([
    ...navigation.destinations.filter(item => item.visible).map(item => item.href), ...settings,
    `/app/containers/${space.id}`, `/app/pages/${pageId}`, `/app/databases/${database.value.id}`, `/app/databases/${database.value.id}/records/${record.value.pageId}`,
  ])];
  const reference = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  for (const route of destinations) {
    const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, `Reference destination ${route}`);
    await expect.poll(() => page.getByRole('main').evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps')))).toBe(true);
    const openedUrl = page.url();
    await page.keyboard.press('ControlOrMeta+/');
    await expect(reference, `Reference opens from ${route}`).toBeVisible();
    for (const keys of keyboardKeys) await expect(reference.getByRole('listitem').locator('kbd').filter({ hasText: new RegExp('^' + keys.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(reference).toHaveCount(0);
    assert.equal(page.url(), openedUrl, 'Closing the reference preserves the current destination.');
  }

  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const paragraph = page.locator(`[data-block-id="${blockId}"]`).getByRole('textbox', { name: 'Paragraph', exact: true });
  // Exercise every documented editor formatting command against committed content.
  const marks = [];
  for (const [key, mark, tag] of [['b', 'bold', 'strong'], ['i', 'italic', 'em'], ['u', 'underline', 'u']]) {
    await paragraph.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press(`ControlOrMeta+${key}`);
    marks.push(mark);
    await expect(paragraph.locator(tag)).toHaveText(text);
    await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks[0].content.text).toEqual([{ text, marks: [...marks] }]);
  }
  const before = await api(`/api/pages/${pageId}`);
  await paragraph.click();
  await page.keyboard.press('ControlOrMeta+/');
  await expect(reference).toBeVisible();
  await reference.getByLabel('Search shortcuts', { exact: true }).fill('bold');
  await expect(reference.getByRole('listitem')).toHaveCount(2);
  await expect(reference.getByRole('listitem').locator('kbd')).toHaveText(['**text**', 'Ctrl B or ⌘ B']);
  await accessible(page, 'searchable keyboard reference over a focused editor');
  await page.keyboard.press('Escape');
  await expect(reference).toHaveCount(0);
  await expect(paragraph).toBeFocused();
  assert.deepEqual((await api(`/api/pages/${pageId}`)).blocks, before.blocks, 'Opening, filtering and closing the reference do not edit the page.');
  await page.keyboard.press('End');
  await page.keyboard.type(' remains editable');
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks[0].content.text.map(span => span.text).join('')).toBe(text + ' remains editable');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(paragraph).toHaveText(text + ' remains editable');
  await accessible(page, 'keyboard reference preserves the saved editor');
  await paragraph.click();
  await page.keyboard.press('ControlOrMeta+k');
  await page.waitForURL(url => url.pathname === '/app/search', { waitUntil: 'networkidle' });
  await expect(page.getByRole('searchbox', { name: 'Search your workspace', exact: true })).toBeVisible();
  if (width === 390) {
    await openNavigation(page);
    await expect(page.getByRole('button', { name: 'Close navigation', exact: true }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  }
}
