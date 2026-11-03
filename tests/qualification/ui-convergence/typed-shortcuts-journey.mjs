import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { accessible, openNavigation } from './browser-support.mjs';

// This is an input corpus for the public editor, independent of its parser.
const shortcuts = [
  ...[1, 2, 3].map(level => ({ typed: '#'.repeat(level) + ' ', type: 'heading', level, reference: 'Headings (then space)', keys: '# / ## / ###' })),
  ...['- ', '* '].map(typed => ({ typed, type: 'list', variant: 'bulleted', reference: 'Bulleted list (then space)', keys: '- or *' })),
  { typed: '1. ', type: 'list', variant: 'numbered', reference: 'Numbered list (then space)', keys: '1.' },
  ...['> ', '" '].map(typed => ({ typed, type: 'quote', reference: 'Quote (then space)', keys: '> or "' })),
  ...['[] ', '[ ] '].map(typed => ({ typed, type: 'task', reference: 'Task (then space)', keys: '[] or [ ]' })),
  { typed: '```', type: 'code', reference: 'Code block', keys: '```' },
  { typed: '---', type: 'divider', reference: 'Divider', keys: '---' },
  { typed: '**synthetic-slate-bold**', type: 'paragraph', mark: 'bold', text: 'synthetic-slate-bold', reference: 'Bold', keys: '**text**' },
  { typed: '*synthetic-slate-italic*', type: 'paragraph', mark: 'italic', text: 'synthetic-slate-italic', reference: 'Italic', keys: '*text*' },
  { typed: '`synthetic-slate-code`', type: 'paragraph', mark: 'code', text: 'synthetic-slate-code', reference: 'Inline code', keys: '`text`' },
];
const plain = spans => spans.map(span => span.text).join('').replaceAll('\u00a0', ' ');
const texts = block => block.blockType === 'list' ? block.content.items[0].text : block.content.text;

function assertConverted(block, shortcut) {
  assert.equal(block.blockType, shortcut.type);
  if (shortcut.level) assert.equal(block.content.level, shortcut.level);
  if (shortcut.variant) {
    assert.equal(block.content.variant, shortcut.variant);
    assert.equal(block.content.items.length, 1);
    assert.ok(block.content.items[0].id, 'The native list item has its own identifier.');
  }
  if (shortcut.type === 'task') assert.equal(block.content.done, false);
  if (shortcut.type === 'divider') assert.deepEqual(block.content, {});
  if (shortcut.type === 'code') {
    assert.equal(block.content.language, 'text');
    assert.equal(block.content.code, '');
  } else if (shortcut.type !== 'divider') {
    assert.equal(plain(texts(block)), shortcut.text ?? '', 'Only the formatting delimiters are consumed.');
    if (shortcut.mark) assert.deepEqual(texts(block), [{ text: shortcut.text, marks: [shortcut.mark] }]);
  }
}

/** Native typing, committed conversion, one undo, durable literal text and reloaded reconversion. */
export async function typedShortcutsJourney(state) {
  const { page, api } = state;
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.locator('[data-page-editor] [data-slate-editable]').first().evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps')))).toBe(true);
  await page.keyboard.press('ControlOrMeta+/');
  const reference = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(reference).toBeVisible();
  const typed = reference.getByRole('heading', { name: 'Typed formatting', exact: true }).locator('..');
  for (const shortcut of shortcuts) {
    const entry = typed.getByRole('listitem').filter({ has: page.getByText(shortcut.reference, { exact: true }) });
    await expect(entry.locator('kbd')).toHaveText(shortcut.keys);
  }
  for (const keys of ['/', '@', '//', 'Ctrl Z or ⌘ Z']) await expect(typed.locator('kbd').filter({ hasText: new RegExp(`^${keys.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })).toBeVisible();
  await accessible(page, 'complete typed formatting reference');
  await page.keyboard.press('Escape');
  await expect(reference).toHaveCount(0);

  // Create through the same menu as a writer; neither bodies nor responses are seeded.
  const previousPath = new URL(page.url()).pathname;
  await openNavigation(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Page', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/app/pages/') && url.pathname !== previousPath, { waitUntil: 'networkidle' });
  const pageId = new URL(page.url()).pathname.split('/').at(-1);
  const title = page.getByRole('textbox', { name: 'Page title', exact: true });
  await title.fill('Typed formatting reference examples');
  await title.press('Tab');
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).page.title).toBe('Typed formatting reference examples');

  for (const shortcut of shortcuts) {
    try {
      await page.getByRole('button', { name: '＋ Add block', exact: true }).click();
      await page.getByRole('option', { name: 'Text', exact: true }).click();
      const paragraph = page.getByRole('textbox', { name: 'Paragraph', exact: true }).last();
      await expect(paragraph).toBeFocused();
      const blockId = await paragraph.evaluate(element => element.closest('[data-block-id]').dataset.blockId);
      const row = page.locator(`[data-block-id="${blockId}"]`);
      const read = async () => (await api(`/api/pages/${pageId}`)).blocks.find(block => block.id === blockId);
      await page.keyboard.type(shortcut.typed);
      await expect.poll(async () => { try { assertConverted(await read(), shortcut); return true; } catch { return false; } }, { message: `Committed conversion for ${JSON.stringify(shortcut.typed)}` }).toBe(true);
      assertConverted(await read(), shortcut);
      if (shortcut.type === 'divider') await expect(row.locator('hr')).toBeVisible();
      else await expect(row.locator('[data-slate-editable]')).toHaveText(shortcut.text ?? '');
      if (shortcut.mark) await expect(row.locator(({bold:'strong', italic:'em', code:'code'})[shortcut.mark])).toHaveText(shortcut.text);

      // No click or focus call may repair focus lost by a conversion.
      await page.keyboard.press('ControlOrMeta+z');
      const undone = row.getByRole('textbox', { name: 'Paragraph', exact: true });
      await expect(undone).toBeFocused();
      await expect(undone.locator('strong, em, code')).toHaveCount(0);
      assert.equal((await undone.textContent()).replaceAll('\u00a0', ' '), shortcut.typed, 'One undo restores every typed character.');
      await expect.poll(async () => {
        const block = await read();
        return block?.blockType === 'paragraph' && plain(block.content.text) === shortcut.typed && block.content.text.every(span => !span.marks?.length);
      }, { message: 'Undo is committed as literal, unformatted text.' }).toBe(true);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal((await undone.textContent()).replaceAll('\u00a0', ' '), shortcut.typed);
      const storedUndo = await read();
      assert.equal(storedUndo.blockType, 'paragraph');
      assert.equal(plain(storedUndo.content.text), shortcut.typed);
      assert.ok(storedUndo.content.text.every(span => !span.marks?.length));

      await undone.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(shortcut.typed);
      await expect.poll(async () => { try { assertConverted(await read(), shortcut); return true; } catch { return false; } }, { message: 'Retyping converts again after durable undo.' }).toBe(true);
      await page.reload({ waitUntil: 'networkidle' });
      assertConverted(await read(), shortcut);
      if (shortcut.type === 'divider') await expect(row.locator('hr')).toBeVisible();
      else await expect(row.locator('[data-slate-editable]')).toHaveText(shortcut.text ?? '');
      if (shortcut.mark) await expect(row.locator(({bold:'strong', italic:'em', code:'code'})[shortcut.mark])).toHaveText(shortcut.text);
    } catch (cause) {
      throw new Error(`Typed shortcut ${JSON.stringify(shortcut.typed)} failed`, { cause });
    }
  }
  await accessible(page, 'typed shortcuts survive undo and reconversion');
}
