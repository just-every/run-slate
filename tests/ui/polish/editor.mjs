import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { capture, insideViewport } from './evidence.mjs';

async function menuGeometry(page, trigger) {
  const menu = page.locator('.insert-menu');
  await expect(menu).toBeVisible();
  await expect.poll(async () => {
    const a = await trigger.boundingBox(), b = await menu.boundingBox();
    if (!a || !b) return false;
    const below = b.y - (a.y + a.height), above = a.y - (b.y + b.height);
    return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
      && ((below >= 0 && below <= 16) || (above >= 0 && above <= 16));
  }).toBe(true);
  await insideViewport(page, menu, 'Entire block menu');
  const a = await trigger.boundingBox(), b = await menu.boundingBox(); assert.ok(a && b);
  const overlapsHorizontally = Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x);
  const below = b.y - (a.y + a.height), above = a.y - (b.y + b.height);
  assert.ok(overlapsHorizontally && ((below >= 0 && below <= 16) || (above >= 0 && above <= 16)), `Block menu sits above/below its trigger with 0–16px edge gap, without overlap (${above}, ${below})`);
}
export async function editorJourney({ page, origin, api }, pageId, width) {
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Page body', exact: true }).fill('Top-level text stays aligned with this document.');
  await expect.poll(async () => JSON.stringify((await api(`/api/pages/${pageId}`)).blocks)).toContain('Top-level text stays aligned');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true })).toHaveCount(1);
  const add = page.getByRole('button', { name: '＋ Add block', exact: true });
  await add.click(); await menuGeometry(page, add); await capture(page, 'addblock-viewport');
  await page.getByRole('option', { name: 'Text', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true })).toHaveCount(2);
  const second = page.getByRole('textbox', { name: 'Paragraph', exact: true }).nth(1);
  await expect(second).toBeFocused();
  await page.keyboard.insertText('A truly nested block keeps its own indentation.');
  await expect.poll(async () => JSON.stringify((await api(`/api/pages/${pageId}`)).blocks)).toContain('A truly nested block');
  const secondRow = page.locator('[data-block-id]').nth(1);
  await secondRow.getByRole('button', { name: /Block actions for/ }).click();
  await expect(page.getByRole('menuitem', { name: /^Indent/ })).toBeVisible();
  await capture(page, 'editor-block-actions');
  await page.getByRole('menuitem', { name: /^Indent/ }).click();
  await expect.poll(async () => { const blocks = (await api(`/api/pages/${pageId}`)).blocks; return blocks[1].parentBlockId === blocks[0].id; }).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true })).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true }).nth(1)).toContainText('A truly nested block keeps its own indentation.');
  const top = page.getByRole('textbox', { name: 'Paragraph', exact: true }).first();
  const nested = page.getByRole('textbox', { name: 'Paragraph', exact: true }).nth(1);
  const title = await page.getByRole('textbox', { name: 'Page title', exact: true }).boundingBox();
  const topBox = await top.boundingBox(), nestedBox = await nested.boundingBox(); assert.ok(title && topBox && nestedBox);
  assert.ok(Math.abs(topBox.x - title.x) <= 12, 'Top-level body aligns with document title within 12px');
  assert.ok(nestedBox.x - topBox.x >= 12, 'Real stored nested indent remains visible');
  await capture(page, 'editor-alignment');
  // A long actual saved block lets the final insert action sit near the lower viewport edge.
  await top.fill(Array.from({ length: 48 }, (_, i) => `Saved scroll line ${i + 1}.`).join('\n'));
  await expect.poll(async () => JSON.stringify((await api(`/api/pages/${pageId}`)).blocks)).toContain('Saved scroll line 16.');
  await expect.poll(async () => JSON.stringify((await api(`/api/pages/${pageId}`)).blocks)).toContain('Saved scroll line 48.');
  await add.evaluate(el => {
    el.scrollIntoView({ block: 'end' });
    // Native scrolling rounds to whole pixels; leave the control 16px inside
    // the edge while still exercising the lower quarter of the viewport.
    window.scrollBy({ top: Math.ceil(el.getBoundingClientRect().bottom - innerHeight + 16), behavior: 'instant' });
  });
  await insideViewport(page, add, 'Lower-edge Add block');
  const lowerTrigger = await add.boundingBox();
  assert.ok(lowerTrigger && lowerTrigger.y >= page.viewportSize().height * .75, 'The second menu is exercised in the lower viewport quarter');
  await add.click(); await menuGeometry(page, add); await capture(page, 'addblock-lower-edge');
  const lowerMenu = await page.locator('.insert-menu').boundingBox(), anchor = await add.boundingBox();
  assert.ok(lowerMenu && anchor && lowerMenu.y + lowerMenu.height <= anchor.y, 'Lower-edge insert menu opens above its trigger');
  await page.getByRole('option', { name: 'Text', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true })).toHaveCount(3);
  // A rendered row can precede the insertion's focus handoff. Type only after
  // Slate has finished that handoff, rather than letting fill choose the focus.
  const inserted = page.getByRole('textbox', { name: 'Paragraph', exact: true }).nth(2);
  await expect(inserted).toBeFocused();
  await page.keyboard.insertText('Inserted by the real lower-edge menu.');
  await expect.poll(async () => JSON.stringify((await api(`/api/pages/${pageId}`)).blocks)).toContain('Inserted by the real lower-edge menu.');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true }).nth(2)).toContainText('Inserted by the real lower-edge menu.');
  // A saved empty editable has no text Range geometry; '/' still opens beside it.
  await add.click(); await menuGeometry(page, add);
  await page.getByRole('option', { name: 'Text', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true })).toHaveCount(4);
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks.length).toBe(4);
  await page.reload({ waitUntil: 'networkidle' });
  const empty = page.getByRole('textbox', { name: 'Paragraph', exact: true }).nth(3);
  await expect(empty).toBeEmpty();
  await empty.click(); await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: 'Insert a block', exact: true })).toBeFocused();
  await menuGeometry(page, empty); await capture(page, 'addblock-empty-caret');
  await page.keyboard.press('Escape');
  await expect(page.locator('.insert-menu')).toHaveCount(0);
  await expect(empty).toBeEmpty();
  await empty.click(); await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: 'Insert a block', exact: true })).toBeFocused();
  await menuGeometry(page, empty);
  await page.getByRole('option', { name: /^Heading 1\s*#$/, exact: true }).click();
  const heading = page.getByRole('textbox', { name: 'Heading level 1', exact: true });
  await expect(heading).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true })).toHaveCount(3);
  await heading.fill('Inserted by the real empty-caret slash menu.');
  await expect.poll(async () => {
    const blocks = (await api(`/api/pages/${pageId}`)).blocks;
    return blocks.length === 4 && blocks[3].blockType === 'heading'
      && blocks[3].content.level === 1
      && blocks[3].content.text.map(span => span.text).join('') === 'Inserted by the real empty-caret slash menu.';
  }).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(heading).toHaveText('Inserted by the real empty-caret slash menu.');
  await expect(page.getByRole('textbox', { name: 'Paragraph', exact: true }).nth(2)).toContainText('Inserted by the real lower-edge menu.');
}
