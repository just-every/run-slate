import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { ok } from './two-people-support.mjs';

const shortcut = 'ControlOrMeta+/';
const reference = page => page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
const paragraph = page => page.getByRole('textbox', { name: 'Paragraph', exact: true }).first();
const plain = block => block.content.text?.map(span => span.text).join('');

// Independent command corpus: the displayed keys must lead to these native outcomes.
const conversions = [
  ...[1, 2, 3].map(level => ({ keys: '#'.repeat(level) + ' ', display: '# or ## or ###', type: 'heading', content: { level } })),
  ...['- ', '* '].map(keys => ({ keys, display: '- or *', type: 'list', content: { variant: 'bulleted' } })),
  { keys: '1. ', display: '1.', type: 'list', content: { variant: 'numbered' } },
  ...['> ', '" '].map(keys => ({ keys, display: '> or "', type: 'quote' })),
  ...['[] ', '[ ] '].map(keys => ({ keys, display: '[] or [ ]', type: 'task', content: { done: false } })),
  { keys: '---', display: '---', type: 'divider' },
  { keys: '```', display: '```', type: 'code', content: { code: '' } },
  { keys: '**Launch**', display: '**text**', type: 'paragraph', mark: 'bold' },
  { keys: '*Launch*', display: '*text*', type: 'paragraph', mark: 'italic' },
  { keys: '`Launch`', display: '`text`', type: 'paragraph', mark: 'code' },
];

async function catalog(page) {
  const dialog = reference(page);
  const displayed = await dialog.locator('kbd').allTextContents();
  for (const keys of new Set(conversions.map(item => item.display))) {
    assert.ok(displayed.includes(keys), `The reference lists the accepted typed command ${keys}.`);
  }
  for (const [label, keys] of [
    ['Insert a block', '/'], ['Mention a person, group, page or date', '@'], ['Set a task due date', '//'],
    ['Open workspace search', 'Ctrl K or ⌘ K'], ['Show keyboard shortcuts', 'Ctrl / or ⌘ /'],
    ['Close an open dialog or mobile navigation', 'Esc'],
    ['Bold', 'Ctrl B or ⌘ B'], ['Italic', 'Ctrl I or ⌘ I'], ['Underline', 'Ctrl U or ⌘ U'],
    ['Undo a formatting conversion, retaining typed text', 'Ctrl Z or ⌘ Z'],
    ['Add a row after this cell', 'Alt Shift ↓'], ['Remove this row', 'Alt Shift ↑'],
    ['Add a column after this cell', 'Alt Shift →'], ['Remove this column', 'Alt Shift ←'],
    ['Next section', '→ or Page Down'], ['Previous section', '← or Page Up'],
    ['Split a block or continue a task', 'Enter'], ['Line break within a block', 'Shift Enter'],
    ['Edit a focused inline status label', 'Enter or Space'],
    ['Move through insert or mention suggestions', '↑ or ↓'],
    ['Choose an insert or mention suggestion', 'Enter'], ['Choose a mention suggestion', 'Tab'],
    ['Close insert or mention suggestions', 'Esc'],
  ]) {
    const row = dialog.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.locator('kbd').filter({ hasText: keys }) });
    await expect(row.locator('kbd')).toHaveText(keys);
  }
}

async function typeCatalog(state, pageId) {
  const { page, api } = state;
  const blockId = (await api(`/api/pages/${pageId}`)).blocks[0].id;
  for (const command of conversions) {
    const body = paragraph(page);
    await body.fill('');
    await page.keyboard.type(command.keys);
    const converted = async () => {
      const block = (await api(`/api/pages/${pageId}`)).blocks[0];
      if (block.id !== blockId || block.blockType !== command.type) return false;
      for (const [key, value] of Object.entries(command.content ?? {})) if (block.content[key] !== value) return false;
      return !command.mark || (plain(block) === 'Launch' && block.content.text[0].marks?.includes(command.mark));
    };
    await expect.poll(converted, { message: `Typed ${JSON.stringify(command.keys)} commits its advertised conversion` }).toBe(true);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(paragraph(page)).toHaveText(command.keys);
    await expect.poll(async () => {
      const block = (await api(`/api/pages/${pageId}`)).blocks[0];
      return block.blockType === 'paragraph' && plain(block) === command.keys && !block.content.text.some(span => span.marks?.length);
    }, { message: 'One undo durably restores every typed character' }).toBe(true);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await expect(paragraph(page)).toHaveText('`Launch`');
  assert.equal((await api(`/api/pages/${pageId}`)).blocks[0].id, blockId);
}

async function editorCommands(state, pageId, blockId) {
  const { page, origin, api } = state;
  const body = paragraph(page);
  await body.fill('Launch readiness');
  for (const [key, mark] of [['B', 'bold'], ['I', 'italic'], ['U', 'underline']]) {
    await body.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press(`ControlOrMeta+${key}`);
    await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks[0].content.text.every(span => span.marks?.includes(mark))).toBe(true);
  }
  await body.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  const selected = await page.evaluate(() => getSelection()?.toString());
  assert.equal(selected, 'ss');
  const before = await api(`/api/pages/${pageId}`);
  await page.keyboard.press(shortcut);
  await catalog(page);
  const dialog = reference(page), search = dialog.getByLabel('Search shortcuts');
  await search.fill('column');
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await expect(dialog).not.toContainText('Open workspace search');
  await search.fill('no such command');
  await expect(dialog.getByRole('status')).toHaveText('No shortcut matches this search.');
  await search.fill('');
  await page.screenshot({ path: `.artifacts/ui-convergence/shortcuts-${page.viewportSize().width}.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(body).toBeFocused();
  assert.equal(await page.evaluate(() => getSelection()?.toString()), selected, 'Closing after reference search restores the editor selection.');
  await page.keyboard.type('ss retained');
  await expect(body).toHaveText('Launch readiness retained');
  await expect.poll(async () => plain((await api(`/api/pages/${pageId}`)).blocks[0])).toBe('Launch readiness retained');
  // The explicit close button preserves an input caret as well as rich selections.
  const title = page.getByRole('textbox', { name: 'Page title', exact: true });
  await title.focus();
  await title.evaluate(input => input.setSelectionRange(2, 5));
  await page.keyboard.press(shortcut);
  await reference(page).getByLabel('Search shortcuts').fill('bold');
  await reference(page).getByRole('button', { name: 'Close shortcuts', exact: true }).click();
  await expect(title).toBeFocused();
  assert.deepEqual(await title.evaluate(input => [input.selectionStart, input.selectionEnd]), [2, 5]);
  assert.equal((await api(`/api/pages/${pageId}`)).page.title, before.page.title);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(body).toHaveText('Launch readiness retained');
  assert.equal((await api(`/api/pages/${pageId}`)).blocks[0].id, blockId);
  await body.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('One line break');
  await expect.poll(async () => plain((await api(`/api/pages/${pageId}`)).blocks[0])).toBe('Launch readiness retained\nOne line break');
  await page.keyboard.press('Enter');
  await page.keyboard.type('A separate paragraph');
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks.map(plain)).toEqual(['Launch readiness retained\nOne line break', 'A separate paragraph']);
  await page.keyboard.press('/');
  const menu = page.getByRole('combobox', { name: 'Insert a block', exact: true });
  await expect(menu).toBeFocused();
  await menu.fill('heading');
  await expect(page.getByRole('option', { name: /^Heading/ })).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Heading level 1', exact: true })).toBeFocused();
  await page.keyboard.type('Inserted by keyboard');
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks.some(block => block.blockType === 'heading' && plain(block) === 'Inserted by keyboard')).toBe(true);
  await page.keyboard.press('/');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await paragraph(page).focus();
  await page.keyboard.press('End');
  await page.keyboard.type('@Morgan');
  const mentions = page.getByRole('listbox', { name: 'Insert mention' });
  await expect(mentions.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Tab');
  await expect(mentions).toHaveCount(0);
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks[0].content.text.some(span => span.mention?.kind === 'person' && span.mention.id === 'browser-reader')).toBe(true);
  await paragraph(page).focus();
  await page.keyboard.press('End');
  await page.keyboard.type('@2026-10-20');
  await expect(mentions.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks[0].content.text.some(span => span.mention?.kind === 'date' && span.mention.id === '2026-10-20')).toBe(true);
  await paragraph(page).focus();
  await page.keyboard.press('End');
  await page.keyboard.type('@');
  await expect(mentions).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(mentions).toHaveCount(0);
  await expect.poll(async () => plain((await api(`/api/pages/${pageId}`)).blocks[0])).toBe('Launch readiness retainedMorgan Reader2026-10-20@\nOne line break');
  const committed = (await api(`/api/pages/${pageId}`)).blocks;
  await page.keyboard.press('ControlOrMeta+K');
  await expect(page).toHaveURL(origin + '/app/search');
  await expect(page.getByRole('searchbox', { name: 'Search your workspace', exact: true })).toBeVisible();
  await page.goBack({ waitUntil: 'networkidle' });
  assert.deepEqual((await api(`/api/pages/${pageId}`)).blocks, committed, 'Workspace search navigation preserves committed editor content.');
}

async function taskAndStatusCommands(state, spaceId) {
  const { page, context, origin, api } = state;
  const { value: { pageId } } = await ok(context, origin, 'POST', '/api/pages', {
    operationKey: randomUUID(), containerId: spaceId, title: 'Keyboard task and label',
    blocks: [
      { id: randomUUID(), blockType: 'task', content: { text: [{ text: 'Coordinate review' }], done: false }, treePosition: 'a' },
      { id: randomUUID(), blockType: 'paragraph', content: { text: [{ text: 'Ready', status: { colour: 'green' } }] }, treePosition: 'b' },
    ],
  });
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const task = page.getByRole('textbox', { name: 'To-do item', exact: true }).first();
  await task.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('//');
  await expect(page.getByLabel('Task due date', { exact: true })).toBeVisible();
  await page.getByLabel('Task due date', { exact: true }).fill('2026-11-15');
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks[0].content.dueDate).toBe('2026-11-15');
  await task.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'To-do item', exact: true })).toHaveCount(2);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks.map(block => block.blockType)).toEqual(['task', 'paragraph', 'paragraph']);
  for (const key of ['Enter', 'Space']) {
    await page.getByRole('button', { name: 'Edit status label: Ready', exact: true }).focus();
    await page.keyboard.press(key);
    const dialog = page.getByRole('dialog', { name: 'Edit status label', exact: true });
    await expect(dialog.getByLabel('Label text')).toHaveValue('Ready');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  assert.equal((await api(`/api/pages/${pageId}`)).blocks.at(-1).content.text[0].text, 'Ready');
}

export async function shortcutReferenceJourney(state, width) {
  const { page, context, origin, api } = state;
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const blockId = randomUUID();
  const { value: { pageId } } = await ok(context, origin, 'POST', '/api/pages', {
    operationKey: randomUUID(), containerId: space.id, title: 'Keyboard handover',
    blocks: [{ id: blockId, blockType: 'paragraph', content: { text: [{ text: 'Keep this editor content.' }] }, treePosition: 'a' }],
  });
  if (width === 1440) {
    const navigation = await api('/api/navigation');
    const routes = new Set(navigation.configuration.destinations.filter(item => item.visible).map(item => item.href));
    routes.add(`/app/containers/${space.id}`);
    const { value: database } = await ok(context, origin, 'POST', '/api/databases', { operationKey: randomUUID(), containerId: space.id, title: 'Shortcut ledger' });
    routes.add(`/app/databases/${database.id}`);
    const { value: record } = await ok(context, origin, 'POST', `/api/databases/${database.id}/records`, { operationKey: randomUUID(), title: 'Keyboard record', values: {} });
    routes.add(`/app/databases/${database.id}/records/${record.pageId}`);
    await page.goto(origin + '/app/settings', { waitUntil: 'networkidle' });
    for (const href of await page.getByRole('navigation', { name: 'Settings sections' }).locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')))) routes.add(href);
    let contents;
    for (const route of routes) {
      const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, route);
      // Server HTML can precede live keyboard handlers. Enter through a real control first.
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const create = page.getByRole('menu', { name: 'Create content', exact: true });
      await expect(create).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(create).toHaveCount(0);
      const input = page.locator('main [contenteditable=true], main input:not([type=hidden]), main textarea').first();
      if (await input.isVisible()) await input.focus();
      await page.keyboard.press(shortcut);
      await expect(reference(page)).toBeVisible();
      if (!contents) {
        await catalog(page);
        contents = await reference(page).getByRole('listitem').allTextContents();
      } else assert.deepEqual(await reference(page).getByRole('listitem').allTextContents(), contents, 'Every destination opens the same complete reference.');
      await page.keyboard.press('Escape');
      await expect(reference(page)).toHaveCount(0);
      assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, route);
    }
  }
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  if (width === 1440) {
    await typeCatalog(state, pageId);
    await editorCommands(state, pageId, blockId);
    await taskAndStatusCommands(state, space.id);
  } else {
    await paragraph(page).focus();
    await page.keyboard.press(shortcut);
    await reference(page).getByLabel('Search shortcuts').fill('');
    await page.screenshot({ path: `.artifacts/ui-convergence/shortcuts-${width}.png` });
    await page.keyboard.press('Escape');
  }
}
