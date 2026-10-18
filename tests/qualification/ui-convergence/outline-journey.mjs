import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { ok } from './two-people-support.mjs';
import { accessible } from './browser-evidence.mjs';

/** PAGE-010: actual typing, persisted heading updates, navigation and empty state. */
export async function outlineJourney({ page, context, origin, api }) {
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const blocks = [
    { id: randomUUID(), blockType: 'heading', content: { level: 1, text: [{ text: 'Incident response' }] } },
    ...Array.from({ length: 18 }, (_, index) => ({ id: randomUUID(), blockType: 'paragraph', content: { text: [{ text: `Step ${index + 1}: confirm the incident owner, update the status page and record the customer impact before changing production.` }] } })),
    { id: randomUUID(), blockType: 'heading', content: { level: 2, text: [{ text: 'Recovery and customer communication after the incident has been resolved' }] } },
    { id: randomUUID(), blockType: 'heading', content: { level: 3, text: [{ text: 'Follow-up actions' }] } },
  ].map((block, index) => ({ ...block, treePosition: String(index).padStart(4, '0') }));
  const { value: { pageId } } = await ok(context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: space.id, title: 'Incident response handbook', blocks });
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await page.locator('.page-outline > summary').click();
  const outline = page.getByRole('navigation', { name: 'Page outline', exact: true });
  await expect(outline.getByRole('button')).toHaveCount(3);
  const recovery = blocks.at(-2);
  const entry = outline.getByRole('button', { name: recovery.content.text[0].text, exact: true });
  await expect(entry).toBeVisible();
  assert.ok(await entry.evaluate(element => element.scrollWidth <= element.clientWidth), 'Long headings wrap within the outline.');
  await accessible(page, 'page outline');
  const width = page.viewportSize().width;
  await page.screenshot({ path: path.join(root, `.artifacts/ui-convergence/outline-${width}-open.png`), fullPage: false });
  await entry.click();
  const target = page.locator(`[data-page-editor] [data-block-id="${recovery.id}"]`);
  await expect.poll(async () => target.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; })).toBe(true);
  await page.screenshot({ path: path.join(root, `.artifacts/ui-convergence/outline-${width}-destination.png`), fullPage: false });
  const heading = target.getByRole('textbox', { name: 'Heading level 2', exact: true });
  const started = Date.now();
  await heading.fill('Recovery checklist');
  await expect(outline.getByRole('button', { name: 'Recovery checklist', exact: true })).toHaveCount(1, { timeout: 2000 });
  assert.ok(Date.now() - started < 2000, 'The outline reflects typing within two seconds.');
  await expect.poll(async () => JSON.stringify((await api(`/api/pages/${pageId}`)).blocks)).toContain('Recovery checklist');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.page-outline > summary').click();
  await expect(outline.getByRole('button', { name: 'Recovery checklist', exact: true })).toBeVisible();
  // Removing every heading removes the outline entirely.
  for (const block of blocks.filter(item => item.blockType === 'heading')) {
    await page.locator(`[data-page-editor] [data-block-id="${block.id}"]`).getByRole('button', { name: /^Block actions for / }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  }
  await expect(page.locator('.page-outline')).toHaveCount(0, { timeout: 2000 });
  await page.screenshot({ path: path.join(root, `.artifacts/ui-convergence/outline-${width}-no-headings.png`), fullPage: false });
}
