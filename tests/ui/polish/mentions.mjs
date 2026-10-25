import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** Use the picker, then only the keyboard: focus/fill must not repair its caret. */
export async function mentionTypingJourney({ page, api }, pageId) {
  const editable = page.locator('[data-page-editor] [data-slate-editable]').first();
  await editable.fill('Owner ');
  await page.keyboard.press('@');
  await page.getByRole('listbox', { name: 'Insert mention' }).getByRole('option', { name: / · Person$/ }).first().click();
  await page.keyboard.type(' will ship it. See ');
  await page.keyboard.press('@');
  await page.getByRole('listbox', { name: 'Insert mention' }).getByRole('option', { name: / · Page$/ }).first().click();
  await page.keyboard.type(' for dates. On ');
  await page.keyboard.press('@');
  await page.keyboard.type('2026-11-03');
  await page.getByRole('listbox', { name: 'Insert mention' }).getByRole('option',{name:'2026-11-03 · Date',exact:true}).click();
  await page.keyboard.type(' we launch.');
  const saved = async () => (await api(`/api/pages/${pageId}`)).blocks[0]?.content.text ?? [];
  await expect.poll(async () => (await saved()).filter(span => !span.mention).map(span => span.text).join('')).toBe('Owner  will ship it. See  for dates. On  we launch.');
  const spans = await saved();
  assert.deepEqual(spans.filter(span => span.mention).map(span => span.mention.kind), ['person', 'page', 'date']);
  await expect(page.locator('[data-page-editor]')).not.toContainText(/Saving|Not saved|Unsaved/);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(editable).toContainText(' will ship it. See ');
  await expect(editable).toContainText(' for dates. On ');
  await expect(editable).toContainText(' we launch.');
  await expect(editable.locator('[data-mention-kind]')).toHaveCount(3);
}
