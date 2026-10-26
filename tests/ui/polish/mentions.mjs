import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { ok } from '../../qualification/ui-convergence/two-people-support.mjs';

/** Use the picker, then only the keyboard: focus/fill must not repair its caret. */
export async function mentionTypingJourney({ page, api, context, origin }, pageId) {
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

  // A task must publish its mention before the asynchronous assignee check.
  // Continue with the keyboard alone: moving the caret would hide the regression.
  const containerId = (await api(`/api/pages/${pageId}`)).page.containerId;
  for (const method of ['Enter', 'click']) {
    const taskPageId = (await ok(context, origin, 'POST', '/api/pages', {
      operationKey: randomUUID(), containerId, title: `Task mention ${method}`,
    })).value.pageId;
    const person = (await api(`/api/tasks/${taskPageId}/assignees`)).items.find(person => person.canRead);
    assert.ok(person, 'The task author can read the new page');
    await page.goto(`${origin}/app/pages/${taskPageId}`, { waitUntil: 'networkidle' });
    await page.getByRole('textbox', { name: 'Page body', exact: true }).click();
    await page.keyboard.type('[] ');
    const item = page.getByRole('textbox', { name: 'To-do item', exact: true });
    await item.click();
    await page.keyboard.type('Review copy ');
    await page.keyboard.press('@');
    await page.keyboard.type(person.displayName);
    const option = page.getByRole('listbox', { name: 'Insert mention' }).getByRole('option', { name: `${person.displayName} · Person`, exact: true });
    await expect(option).toBeVisible();
    // Hold the real permission response until continuation is typed, so an old
    // assignment closure cannot replace newer words when that response arrives.
    const assignees = `${origin}/api/tasks/${taskPageId}/assignees`;
    let release, received, finish, transportError, started = false;
    const held = new Promise(resolve => { release = resolve; });
    const checked = new Promise(resolve => { received = resolve; });
    const forwarded = new Promise(resolve => { finish = resolve; });
    const hold = async route => {
      started = true;
      try {
        const response = await route.fetch(); received();
        await held; await route.fulfill({ response });
      } catch (error) { transportError = error; received(); }
      finally { finish(); }
    };
    await page.route(assignees, hold);
    try {
      if (method === 'click') await option.click();
      else await page.keyboard.press('Enter');
      await page.keyboard.type(' will ship.');
      await checked;
    } finally {
      release();
      if (started) await forwarded;
      await page.unroute(assignees, hold);
    }
    if (transportError) throw transportError;
    await expect(item).toBeFocused();
    await expect(item).toHaveText(`Review copy @${person.displayName} will ship.`);
    const task = async () => (await api(`/api/pages/${taskPageId}`)).blocks.find(block => block.blockType === 'task')?.content;
    await expect.poll(async () => {
      const saved = await task();
      return { text: saved?.text.map(span => span.text).join(''), assignee: saved?.assigneeMemberId };
    }).toEqual({ text: `Review copy ${person.displayName} will ship.`, assignee: person.id });
    const caret = await item.evaluate(element => {
      const selection = getSelection(), range = document.createRange();
      range.selectNodeContents(element); range.setStart(selection.focusNode, selection.focusOffset);
      return { collapsed: selection.isCollapsed, after: range.toString() };
    });
    assert.deepEqual(caret, { collapsed: true, after: '' }, 'Continuation leaves the caret after the final words');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(item).toHaveText(`Review copy @${person.displayName} will ship.`);
    await expect(page.getByRole('combobox', { name: 'Task assignee', exact: true })).toHaveValue(person.id);
  }
}
