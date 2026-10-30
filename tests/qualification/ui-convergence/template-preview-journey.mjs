import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible } from './browser-evidence.mjs';
import { ok } from './two-people-support.mjs';

const text = value => [{ text: value }];
const words = value => value.replace(/\s+/g, ' ').trim();

function authoredTree(figures) {
  const page = (title, heading, body, labels, children = []) => ({
    title, properties: { icon: '🌿', coverFileId: null, cover: { kind: 'gallery', id: 'forest' }, labels,
      typeface: 'serif', smallText: false, fullWidth: true },
    blocks: [
      { id: randomUUID(), blockType: 'heading', content: { level: 1, text: text(heading) }, treePosition: 'a0' },
      { id: randomUUID(), blockType: 'paragraph', content: { text: text(body) }, treePosition: 'a1' },
    ], children,
  });
  const grandchild = page('Follow-up checklist', 'After the session', 'Retain the decisions and notify the coordinator.', ['follow-up']);
  const child = page('Facilitator notes', 'During the session', 'Capture questions in the order they arise.', ['facilitation'], [grandchild]);
  const sibling = page('Reading list', 'Before the session', 'Read the proposal and bring open questions.', ['preparation']);
  return page(figures ? 'Authored workshop' : 'Open discussion', 'Session outline',
    figures ? 'Team size: 7 people. Duration: 45 minutes.' : 'Gather the notes and decisions.', ['planning', 'workshop'], [child, sibling]);
}

function body(blocks) {
  // Compare structure and authored content independently of fresh copy identifiers.
  return blocks.map(block => ({ blockType: block.blockType, content: block.content,
    parent: block.parentBlockId ? blocks.findIndex(parent => parent.id === block.parentBlockId) : null,
    treePosition: block.treePosition }));
}
function properties(value) {
  return Object.fromEntries(['icon', 'coverFileId', 'cover', 'labels', 'typeface', 'smallText', 'fullWidth', 'databaseFields']
    .filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
function comparePage(actual, expected) {
  assert.equal(actual.title, expected.title);
  assert.deepEqual(properties(actual.properties), expected.properties);
  assert.deepEqual(body(actual.blocks), body(expected.blocks));
}
function compareSnapshot(actual, expected) {
  comparePage(actual, expected);
  assert.equal(actual.children.length, expected.children.length);
  actual.children.forEach((child, index) => compareSnapshot(child, expected.children[index]));
}

async function saveCorpus(state) {
  const { context, origin, api } = state;
  const mutate = async (method, route, data) => (await ok(context, origin, method, route, { operationKey: randomUUID(), ...data })).value;
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const corpus = [];
  for (const figures of [true, false]) {
    const expected = authoredTree(figures);
    const database = await mutate('POST', '/api/databases', { containerId: space.id, title: expected.title + ' source' });
    const fields = [{ id: randomUUID(), name: 'Coordinator', type: 'text', config: {}, position: 0, value: 'Support rotation' },
      ...(figures ? [{ id: randomUUID(), name: 'Team size', type: 'number', config: {}, position: 1, value: 7 },
        { id: randomUUID(), name: 'Duration', type: 'text', config: {}, position: 2, value: '45 minutes' }] : [])];
    let revisionId = database.revisionId;
    for (const { value, ...field } of fields) revisionId = (await mutate('POST', `/api/databases/${database.id}/fields`, { expectedRevisionId: revisionId, field })).revisionId;
    const record = await mutate('POST', `/api/databases/${database.id}/records`, {
      title: expected.title, values: Object.fromEntries(fields.map(field => [field.id, field.value])),
    });
    expected.properties.databaseFields = Object.fromEntries(fields.map(field => [field.id, field.value]));
    const source = await api(`/api/pages/${record.pageId}`);
    await mutate('PUT', `/api/pages/${record.pageId}/blocks`, { expectedRevisionId: source.page.revisionId, blocks: expected.blocks });
    const populated = await api(`/api/pages/${record.pageId}`);
    await mutate('PATCH', `/api/pages/${record.pageId}`, { expectedRevisionId: populated.page.revisionId,
      properties: Object.fromEntries(Object.entries(expected.properties).filter(([key]) => key !== 'databaseFields')) });
    expected.sourceId = record.pageId;
    const createChildren = async parent => {
      for (const [index, child] of parent.children.entries()) {
        const created = await mutate('POST', '/api/pages', { containerId: space.id, parentPageId: parent.sourceId,
          title: child.title, blocks: child.blocks, properties: child.properties, treePosition: `a${index}` });
        child.sourceId = created.pageId;
        await createChildren(child);
      }
    };
    await createChildren(expected);
    const saved = await mutate('POST', '/api/templates', { sourcePageId: expected.sourceId, includeChildren: true,
      containerId: null, title: expected.title + ' template', description: 'A retained session plan.', category: 'Preview proof' });
    const retained = await api(`/api/templates/${saved.id}`);
    // A later source edit cannot leak into the retained preview.
    const current = await api(`/api/pages/${expected.sourceId}`);
    await mutate('PATCH', `/api/pages/${expected.sourceId}`, { expectedRevisionId: current.page.revisionId, properties: { title: 'Changed source after capture' } });
    corpus.push({ id: saved.id, retained, expected, fields, spaceId: space.id });
  }
  return corpus;
}

async function openPreview(state, item, inspect) {
  const { page, origin } = state;
  await page.goto(origin + '/app/templates', { waitUntil: 'networkidle' });
  await page.getByLabel('Category', { exact: true }).fill('Preview proof');
  await page.locator('.template-choice').filter({ has: page.getByRole('heading', { name: item.retained.title, exact: true }) }).click();
  const preview = page.locator('.template-preview');
  await expect(preview.getByRole('heading', { name: item.retained.title, exact: true, level: 2 })).toBeVisible();
  const snapshot = preview.locator(':scope > .template-snapshot');
  if (inspect) {
    const inspectPage = async (view, expected, fields = []) => {
      await expect(view).toHaveAttribute('aria-label', `Page preview: ${expected.title}`);
      await expect(view).toHaveAttribute('data-typeface', expected.properties.typeface);
      await expect(view).toHaveAttribute('data-small-text', String(expected.properties.smallText));
      await expect(view).toHaveAttribute('data-full-width', String(expected.properties.fullWidth));
      await expect(view.locator(':scope > [role="img"]')).toHaveAccessibleName('forest gallery cover');
      // Exact authored text excludes extra figures, inferred metrics and placeholders.
      const ownText = await view.evaluate(element => {
        return [...element.children].filter(child => !child.classList.contains('template-snapshot'))
          .map(child => child.innerText).join(' ');
      });
      const ownWords = [expected.properties.icon, expected.title, 'Labels: ' + expected.properties.labels.join(', '),
        ...fields.flatMap(field => [field.name, String(field.value)]), ...expected.blocks.map(block => block.content.text.map(span => span.text).join(''))];
      assert.equal(words(ownText), words(ownWords.join(' ')), 'The preview contains exactly the authored page, properties and figures.');
      const children = view.locator(':scope > .template-snapshot');
      await expect(children).toHaveCount(expected.children.length);
      for (const [index, child] of expected.children.entries()) await inspectPage(children.nth(index), child);
    };
    await inspectPage(snapshot, item.expected, item.fields);
    const figures = (await preview.innerText()).match(/\b\d+(?:\.\d+)?\b/g) ?? [];
    assert.deepEqual(figures, item.fields.some(field => field.name === 'Team size') ? ['7', '45', '7', '45'] : [],
      'Only the figures the author supplied appear anywhere in the complete preview.');
    await expect(preview).not.toContainText(/\b(?:estimated|inferred|placeholder|TBD|unknown)\b/i);
    if (!figures.length) await expect(preview).not.toContainText(/team size|duration|not specified/i);
    await expect(snapshot.locator('input[placeholder], [contenteditable="true"]')).toHaveCount(0);
    // Nothing is created while browsing the complete preview.
    assert.equal((await state.api('/api/pages')).items.some(page => page.title === item.expected.title && page.id !== item.expected.sourceId), false);
  }
  await accessible(page, `template preview ${item.expected.title}`);
  await snapshot.screenshot({ path: path.join(root, `.artifacts/ui-convergence/template-preview-${page.viewportSize().width}-${item.id}.png`) });
}

async function readCopy(state, id, expected, spaceId, parentPageId = null) {
  const document = await state.api(`/api/pages/${id}`);
  comparePage({ ...document, title: document.page.title }, expected);
  assert.equal(document.page.containerId, spaceId);
  const tree = (await state.api('/api/pages')).items;
  assert.equal(tree.find(page => page.id === id).parentPageId, parentPageId);
  assert.notEqual(id, expected.sourceId);
  assert.ok(document.blocks.every(block => !expected.blocks.some(source => source.id === block.id)), 'Copies own fresh block identifiers.');
  const children = tree.filter(page => page.parentPageId === id);
  assert.deepEqual(children.map(page => page.title), expected.children.map(child => child.title));
  const result = { id, document, children: [] };
  for (const [index, child] of expected.children.entries()) result.children.push(await readCopy(state, children[index].id, child, spaceId, id));
  return result;
}

/** Complete native preview and copy reconciliation in the existing desktop registration. */
export async function templatePreviewJourney(state) {
  const { page, context, origin, api } = state;
  for (const item of await saveCorpus(state)) {
    compareSnapshot(item.retained.snapshot, item.expected);
    assert.deepEqual(item.retained.snapshot.fieldDefinitions.map(field => ({ name: field.name, type: field.type })),
      item.fields.map(field => ({ name: field.name, type: field.type })));
    assert.deepEqual(await api(`/api/templates/${item.id}`), item.retained, 'The retained preview ignores later source edits.');
    await openPreview(state, item, true);
    const before = (await api('/api/pages')).items.map(page => page.id);
    await page.getByRole('button', { name: 'Use this template', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Use this template', exact: true });
    await dialog.getByRole('combobox', { name: /^Create in/ }).selectOption({ label: 'Handbook' });
    const committed = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/templates/${item.id}/apply`);
    await dialog.getByRole('button', { name: 'Create page', exact: true }).click();
    const response = await committed;
    assert.equal(response.status(), 201);
    // The native action navigates immediately; read its committed destination instead of a discarded response buffer.
    await expect(page).toHaveURL(/\/app\/pages\/[^/]+$/);
    const copyId = new URL(page.url()).pathname.split('/').at(-1);
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(item.expected.title);
    await page.reload({ waitUntil: 'networkidle' });
    const copy = await readCopy(state, copyId, item.expected, item.spaceId);
    assert.equal((await api('/api/pages')).items.filter(page => !before.includes(page.id)).length, 4, 'Apply creates exactly the previewed four-page tree.');
    assert.deepEqual(await api(`/api/templates/${item.id}`), item.retained);
    const unchangedCopy = async () => {
      assert.deepEqual(await readCopy(state, copyId, item.expected, item.spaceId), copy);
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(item.expected.title);
      await expect(page.locator('[data-page-editor]')).toContainText(item.expected.blocks[1].content.text[0].text);
    };
    // The next same-file clause: a later template revision, archive and deletion leave the native copy intact.
    const replacement = (await api('/api/pages')).items.find(page => page.title === 'Welcome');
    let changed = await ok(context, origin, 'POST', '/api/templates', { operationKey: randomUUID(), id: item.id,
      expectedRevisionId: item.retained.revisionId, sourcePageId: replacement.id, includeChildren: false,
      containerId: null, title: 'Replaced session template', description: 'A different capture.', category: 'Preview proof' });
    assert.equal((await api(`/api/templates/${item.id}`)).snapshot.title, 'Welcome');
    await unchangedCopy();
    for (const action of ['archive', 'delete']) {
      changed = await ok(context, origin, 'POST', `/api/templates/${item.id}/change`, { operationKey: randomUUID(), expectedRevisionId: changed.value.revisionId, action });
      const listed = (await api(`/api/templates?state=${action === 'archive' ? 'archived' : 'deleted'}`)).items;
      assert.ok(listed.some(template => template.id === item.id), `The ${action} action is retained in its native collection.`);
      await unchangedCopy();
    }
  }
}

/** The existing phone smoke captures both populated previews without repeating the desktop assertions. */
export async function templatePreviewSmoke(state) {
  for (const item of await saveCorpus(state)) await openPreview(state, item, false);
}
