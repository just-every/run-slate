import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { openNavigation } from '../../qualification/ui-convergence/browser-support.mjs';
import { withHeldResponse, withPausedCollaboration } from './editor-focus-transport.mjs';

export async function editorFocusJourney({ page, context, origin, api }, containerId, part) {
  const paragraph = () => page.getByRole('textbox', { name: 'Paragraph', exact: true });
  const heading = () => page.getByRole('textbox', { name: 'Heading level 1', exact: true });
  const title = () => page.getByRole('textbox', { name: 'Page title', exact: true });
  async function freshPage(name) {
    const response = await context.request.post(`${origin}/api/pages`, { data: { operationKey: randomUUID(), containerId, title: name } });
    assert.equal(response.status(), 200, await response.text());
    const pageId = (await response.json()).value.pageId;
    await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '＋ Add block', exact: true }).click();
    await page.getByRole('option', { name: 'Text', exact: true }).click();
    await expect(paragraph()).toBeFocused();
    await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks.length).toBe(1);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(paragraph()).toBeEmpty();
    return pageId;
  }
  async function insertHeading() {
    await paragraph().click();
    await page.keyboard.press('/');
    await expect(page.getByRole('combobox', { name: 'Insert a block', exact: true })).toBeFocused();
    await page.getByRole('option', { name: /^Heading 1\s*#$/, exact: true }).click();
  }
  async function pending() {
    await expect(page.locator('.editor-save-status')).toHaveText('Saving…');
    await expect(heading()).toHaveAttribute('contenteditable', 'true');
    await expect(heading()).toBeFocused();
    await expect(paragraph()).toHaveCount(0);
  }
  async function collaboratorWrites(pageId, text) {
    const saved = await api(`/api/pages/${pageId}`), block = saved.blocks[0];
    const response = await context.request.patch(`${origin}/api/pages/${pageId}/blocks/${block.id}`, {
      data: { operationKey: randomUUID(), expectedRevisionId: block.revisionId, content: { ...block.content, text: [{ text }] } },
    });
    assert.equal(response.status(), 200, await response.text());
    // This DOM update can only arrive through the application's genuine collaboration poll.
    await expect(heading()).toHaveText(text);
  }

  if (part === 'insertion') {
  const delayed = await freshPage('Delayed heading focus');
  const replacedId = (await api(`/api/pages/${delayed}`)).blocks[0].id;
  await withHeldResponse(page, `/api/pages/${delayed}`, 'GET', async gate => {
    await insertHeading();
    const saved = await gate.arrived;
    assert.equal(saved.blocks.length, 1);
    assert.equal(saved.blocks[0].blockType, 'heading');
    assert.notEqual(saved.blocks[0].id, replacedId, 'The empty paragraph is replaced by the actual inserted ID');
    await pending();
    gate.release();
    await expect(heading()).toBeFocused();
    await expect(heading()).toHaveAttribute('contenteditable', 'true');
    // Keyboard input has no locator focus/fill that could repair a lost focus handoff.
    await page.keyboard.type('Keyboard text after the genuine delayed response.');
    await expect.poll(async () => (await api(`/api/pages/${delayed}`)).blocks[0].content.text.map(span => span.text).join('')).toBe('Keyboard text after the genuine delayed response.');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(heading()).toHaveText('Keyboard text after the genuine delayed response.');
  await title().click();
  await collaboratorWrites(delayed, 'A later collaboration update leaves focus alone.');
  await expect(title()).toBeFocused();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(heading()).toHaveText('A later collaboration update leaves focus alone.');
  assert.equal((await api(`/api/pages/${delayed}`)).blocks[0].content.level, 1);

  // Hold the genuine creation receipt across the first typing, without a fill
  // or focus call that could hide the new-block race. No API result is faked.
  for (const delay of [0, 300, 2000]) {
    const target = await freshPage(`Immediate typing after ${delay}ms`);
    await withHeldResponse(page, `/api/pages/${target}/blocks`, 'PUT', async gate => {
      await page.getByRole('button', { name: '＋ Add block', exact: true }).click();
      await page.getByRole('option', { name: 'Text', exact: true }).click();
      await page.waitForTimeout(delay);
      const text = `Typed after ${delay}ms without losing the first letters.`;
      const typing = page.keyboard.type(text, { delay: 90 });
      await gate.arrived;
      await expect(page.locator('.editor-save-status')).toHaveText('Saving…');
      const element = await paragraph().last().elementHandle();
      gate.release();
      await typing;
      await expect.poll(async () => (await api(`/api/pages/${target}`)).blocks.at(-1).content.text.map(span => span.text).join('')).toBe(text);
      assert.equal(await element.evaluate(node => node.isConnected), true, 'The editable survives its creation receipt');
      await page.reload({ waitUntil: 'networkidle' });
      await expect(paragraph().last()).toHaveText(text);
    });
  }

  const redirected = await freshPage('Later title focus wins');
  await withHeldResponse(page, `/api/pages/${redirected}`, 'GET', async gate => {
    await insertHeading();
    await gate.arrived;
    await pending();
    await title().click();
    await expect(title()).toBeFocused();
    gate.release();
    await expect(heading()).toHaveAttribute('contenteditable', 'true');
    await expect(title()).toBeFocused();
  });
  await collaboratorWrites(redirected, 'Collaboration cannot revive a cancelled focus request.');
  await expect(title()).toBeFocused();

  }
  if (part === 'navigation') {
  const failed = await freshPage('Failed insertion focus is cancelled');
  await withPausedCollaboration(page, failed, async resume => {
    await withHeldResponse(page, `/api/pages/${failed}/blocks`, 'PUT', async gate => {
      await insertHeading();
      await gate.arrived;
      await pending();
      gate.release();
      await expect(page.getByRole('alert')).toContainText('The server could not be reached');
      await expect(heading()).toHaveAttribute('contenteditable', 'true');
      await expect(page.locator('.editor-save-status')).toContainText('Unsaved');
      await title().click();
      // The Worker committed, but its response was lost. A later genuine read
      // must expose that heading without reviving the failed operation's focus.
      resume();
      await expect(heading()).toHaveAttribute('contenteditable', 'true');
      await expect(heading()).not.toBeFocused();
    }, { disconnect: true });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(heading()).toBeEmpty();

  const departed = await freshPage('Navigation cancels pending insertion focus');
  // Establish a same-document forward/back route, then leave through browser
  // history while saving. No pointer or Tab event cancels the pending intent.
  await openNavigation(page);
  await page.locator('.navlink').filter({ hasText: /^Search/ }).click();
  await expect(page).toHaveURL(`${origin}/app/search`);
  await page.goBack();
  await expect(paragraph()).toBeVisible();
  await withHeldResponse(page, `/api/pages/${departed}`, 'GET', async gate => {
    await insertHeading();
    await gate.arrived;
    await pending();
    await page.goForward();
    await expect(page).toHaveURL(`${origin}/app/search`);
    await expect(page.locator('[data-page-editor]')).toHaveCount(0);
    await page.goBack();
    await expect(heading()).toBeEmpty();
    await title().click();
    gate.release();
    await gate.finished;
    await collaboratorWrites(departed, 'Returning to the page does not revive its disposed focus request.');
    await expect(title()).toBeFocused();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(heading()).toHaveText('Returning to the page does not revive its disposed focus request.');
  await expect(heading()).not.toBeFocused();

  }
  if (part === 'formatting') {
  // One shortcut journey: real typing changes the stored kind, retains rich
  // content and the block ID, supports one-step undo, then survives a reload.
  for (const level of [1, 2, 3]) {
    const shortcutPage = await freshPage(`Typed heading ${level}`);
    let stored = await api(`/api/pages/${shortcutPage}`);
    const source = [
      { text: 'Launch', marks: ['bold', 'italic'], colour: 'yellow', commentAnchorId: 'heading-anchor' },
      { text: ' source', link: { href: 'https://example.invalid/heading' }, marks: ['underline'] },
      { text: '15 Oct 2026', mention: { kind: 'date', id: '2026-10-15', label: '15 Oct 2026' } },
      { text: ' tail' },
    ];
    const blockId = stored.blocks[0].id;
    const prepared = await context.request.patch(`${origin}/api/pages/${shortcutPage}/blocks/${blockId}`, {
      data: { operationKey: randomUUID(), expectedRevisionId: stored.blocks[0].revisionId, content: { text: source } },
    });
    assert.equal(prepared.status(), 200, await prepared.text());
    await page.reload({ waitUntil: 'networkidle' });
    await paragraph().focus();
    await paragraph().evaluate(element => {
      element.focus();
      const range = document.createRange();range.selectNodeContents(element);range.collapse(true);
      const selection = getSelection();selection.removeAllRanges();selection.addRange(range);
    });
    await page.keyboard.type('#'.repeat(level));
    await page.keyboard.press('Space');
    const converted = page.getByRole('textbox', { name: `Heading level ${level}`, exact: true });
    await expect(converted).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(paragraph()).toBeFocused();
    await expect(paragraph()).toContainText('#'.repeat(level));
    // Reinsert the shortcut in a single browser input event as well.
    await paragraph().evaluate(element => {
      element.focus();
      const range = document.createRange();range.selectNodeContents(element);range.collapse(true);
      const selection = getSelection();selection.removeAllRanges();selection.addRange(range);
    });
    for (let index = 0; index <= level; index++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText('#'.repeat(level) + ' ');
    await expect(converted).toBeFocused();
    await expect.poll(async () => {
      stored = await api(`/api/pages/${shortcutPage}`);
      return stored.blocks[0].blockType === 'heading' && stored.blocks[0].content.level === level;
    }).toBe(true);
    assert.equal(stored.blocks[0].id, blockId);
    assert.deepEqual(stored.blocks[0].content.text, source);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(converted).toContainText('Launch');
    assert.deepEqual((await api(`/api/pages/${shortcutPage}`)).blocks[0].content.text, source);
  }
  }
}
