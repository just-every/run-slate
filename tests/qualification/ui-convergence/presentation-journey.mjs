import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { ok } from './two-people-support.mjs';

/** PAGE-011: a meeting deck stays read-only, navigable and leaves the page where it was. */
export async function presentationJourney({ page, context, origin, api }) {
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const text = (value) => ({ text: [{ text: value }] });
  const blocks = [
    { blockType: 'paragraph', content: text('Weekly operations review: service health, customer impact and follow-up owners.') },
    { blockType: 'heading', content: { ...text('Service health'), level: 1 } },
    ...Array.from({ length: 20 }, (_, i) => ({ blockType: 'paragraph', content: text(`Service ${i + 1}: review error rates, response times and the on-call handover before closing the weekly report.`) })),
    { blockType: 'heading', content: { ...text('Customer impact'), level: 2 } },
    { blockType: 'task', content: { ...text('Send the customer update'), done: false } },
    { blockType: 'heading', content: { ...text('Follow-up owners'), level: 1 } },
    { blockType: 'paragraph', content: text('Morgan coordinates the recovery checklist. Alex owns the next review.') },
  ].map((block, i) => ({ ...block, id: randomUUID(), treePosition: String(i).padStart(4, '0') }));
  const { value: { pageId } } = await ok(context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: space.id, title: 'Operations review', blocks });
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const before = await api(`/api/pages/${pageId}`);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Present this page', exact: true }).focus();
  // Keep a nonzero reading position while activating the focused menu action by keyboard.
  // Clicking the off-screen top bar after scrolling would first scroll the document back up.
  await page.evaluate(() => window.scrollTo(0, 400));
  const scroll = await page.evaluate(() => window.scrollY);
  assert.ok(scroll > 0);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Presenting Operations review', exact: true });
  await expect(dialog).toBeVisible();
  assert.notEqual(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.deepEqual(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }), [0, 0, page.viewportSize().width, page.viewportSize().height]);
  await expect(dialog.getByRole('status')).toHaveText('1 / 3');
  await expect(dialog.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await expect(dialog.locator('[contenteditable="true"], textarea, input, nav, [data-block-actions]')).toHaveCount(0);
  await expect(dialog).toContainText('Weekly operations review');
  await expect(dialog).not.toContainText('Service 1:');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('status')).toHaveText('2 / 3');
  await expect(dialog).toContainText('Customer impact');
  const article = dialog.getByRole('article');
  await article.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(dialog.getByRole('checkbox')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeInViewport();
  const width = page.viewportSize().width;
  await page.screenshot({ path: `.artifacts/ui-convergence/presentation-${width}-long-slide.png` });
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('3 / 3');
  assert.equal(await article.evaluate(el => el.scrollTop), 0);
  await expect(dialog).toContainText('Morgan coordinates');
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.screenshot({ path: `.artifacts/ui-convergence/presentation-${width}-last-slide.png` });
  await page.keyboard.press('PageUp');
  await expect(dialog.getByRole('status')).toHaveText('2 / 3');
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('status')).toHaveText('1 / 3');
  await expect(dialog).toContainText('Weekly operations review');
  await page.keyboard.press('PageDown');
  await expect(dialog.getByRole('status')).toHaveText('2 / 3');
  await expect(dialog).toContainText('Customer impact');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll);
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeFocused();
  assert.equal((await api(`/api/pages/${pageId}`)).page.revisionId, before.page.revisionId);
  await page.screenshot({ path: `.artifacts/ui-convergence/presentation-${width}-returned.png` });
  // A page without headings is one whole slide, including an empty page.
  for (const body of [[{ id: randomUUID(), blockType: 'paragraph', content: text('A short team update with no headings.'), treePosition: 'a' }], []]) {
    const result = await ok(context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: space.id, title: body.length ? 'Team update' : 'Empty review', blocks: body });
    await page.goto(`${origin}/app/pages/${result.value.pageId}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Present this page', exact: true }).click();
    const single = page.getByRole('dialog');
    await expect(single.getByRole('status')).toHaveText('1 / 1');
    await expect(single.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await single.getByRole('button', { name: 'Exit presentation', exact: true }).click();
    await expect(single).toHaveCount(0);
  }
}
