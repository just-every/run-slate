import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { ok } from './two-people-support.mjs';
import { accessible } from './browser-evidence.mjs';

const propertyNames = ['icon', 'coverFileId', 'cover', 'labels', 'typeface', 'smallText', 'fullWidth', 'databaseFields'];
const copiedProperties = properties => Object.fromEntries(propertyNames.map(name => [name, properties[name] ?? null]));
const blocksWithoutIds = blocks => blocks.map(block => ({
  blockType: block.blockType, content: block.content, treePosition: block.treePosition,
  parent: block.parentBlockId ? blocks.findIndex(parent => parent.id === block.parentBlockId) : null,
}));
const snapshotValues = snapshot => ({
  title: snapshot.title, properties: copiedProperties(snapshot.properties),
  blocks: blocksWithoutIds(snapshot.blocks), children: snapshot.children.map(snapshotValues),
});

/** Native template copies retain the entire authored tree across later template mutations. */
export async function templateSnapshotJourney({ page, context, origin, api }) {
  const width = page.viewportSize().width;
  const receipts = [];
  async function nativeReceipt(route, submit) {
    // Read the genuine Worker response before returning its unchanged bytes to
    // the browser. Apply navigates immediately and Chromium can discard its
    // response buffer before an external observer reads the committed receipt.
    const match = url => url.pathname === route;
    let captured;
    const capture = async request => {
      if (request.request().method() !== 'POST') return request.continue();
      const response = await request.fetch({ maxRetries: 0 });
      captured = { status: response.status(), body: await response.json() };
      await request.fulfill({ response });
    };
    await page.route(match, capture);
    try {
      const pending = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === route);
      await submit();
      const response = await pending;
      assert.ok(response.ok(), `${route}: ${captured.status} ${JSON.stringify(captured.body)}`);
      const result = captured.body;
      assert.ok(result.receipt.revisionId && result.receipt.operationKey);
      receipts.push({ route, ...result });
      return result;
    } finally {
      await page.unroute(match, capture);
    }
  }
  const sourceSpace = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const destination = await ok(context, origin, 'POST', '/api/containers', {
    operationKey: randomUUID(), name: 'Snapshot destination', visibility: 'private',
  });
  const destinationId = destination.value.id;
  const definitions = [
    { title: 'Incident playbook', parent: null, icon: '📘', typeface: 'serif', fullWidth: true },
    { title: 'Investigate incident', parent: 0, icon: '🔎', typeface: 'mono', fullWidth: false },
    { title: 'Escalation checklist', parent: 1, icon: '📋', typeface: 'default', fullWidth: true },
    { title: 'Close incident', parent: 0, icon: '✅', typeface: 'default', fullWidth: false },
  ];
  const sourceIds = [], expectedSources = [];
  for (const [index, definition] of definitions.entries()) {
    const heading = randomUUID();
    const input = {
      operationKey: randomUUID(), containerId: sourceSpace.id,
      parentPageId: definition.parent === null ? null : sourceIds[definition.parent],
      title: definition.title, treePosition: `snapshot-${index}`,
      properties: { icon: definition.icon, labels: [`snapshot-${index}`, 'template-proof'],
        cover: { kind: 'gallery', id: 'ocean' }, typeface: definition.typeface, smallText: index % 2 === 1, fullWidth: definition.fullWidth },
      blocks: [
        { id: heading, blockType: 'heading', content: { text: [{ text: `${definition.title} procedure` }], level: 2 }, treePosition: 'a' },
        { id: randomUUID(), parentBlockId: heading, blockType: 'paragraph', content: { text: [{ text: `Retained instruction ${index}`, marks: ['bold'] }] }, treePosition: 'b' },
        { id: randomUUID(), blockType: 'paragraph', content: { text: [{ text: `Independent detail ${index}` }] }, treePosition: 'c' },
      ],
    };
    const created = await ok(context, origin, 'POST', '/api/pages', input);
    const stored = await api(`/api/pages/${created.value.pageId}`);
    assert.equal(stored.page.title, definition.title);
    assert.deepEqual(copiedProperties(stored.properties), copiedProperties(input.properties));
    assert.deepEqual(blocksWithoutIds(stored.blocks), blocksWithoutIds(input.blocks));
    expectedSources.push(input);
    sourceIds.push(created.value.pageId);
  }
  async function readTree(rootId, parentId = null, containerId = destinationId) {
    const listing = (await api(`/api/pages?containerId=${containerId}`)).items;
    async function visit(id, parent) {
      const document = await api(`/api/pages/${id}`);
      assert.equal(document.page.containerId, containerId);
      assert.equal(document.parentPageId, parent);
      const children = [];
      for (const child of listing.filter(item => item.parentPageId === id)) children.push(await visit(child.id, id));
      return { id, title: document.page.title, properties: document.properties, blocks: document.blocks,
        page: document.page, workingRevisionId: document.workingRevisionId, publishedRevisionId: document.publishedRevisionId,
        parentPageId: document.parentPageId, children };
    }
    return visit(rootId, parentId);
  }
  const authored = await readTree(sourceIds[0], null, sourceSpace.id);
  assert.deepEqual(flatten(authored).map(item => item.id), sourceIds, 'The source tree contains every seeded page in order, including the grandchild.');
  await page.goto(`${origin}/app/pages/${sourceIds[0]}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save as template', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Save as a template', exact: true });
  await save.getByLabel('Template name', { exact: true }).fill('Immutable incident template');
  await save.getByLabel('Description', { exact: true }).fill('A complete retained incident procedure.');
  await save.getByLabel('Category', { exact: true }).fill('Snapshot proof');
  await save.getByLabel('Include child pages you can access', { exact: true }).check();
  const saved = await nativeReceipt('/api/templates', () => save.getByRole('button', { name: 'Save template', exact: true }).click());
  await expect(save).not.toBeVisible();
  const templateId = saved.value.id;
  const snapshot = (await api(`/api/templates/${templateId}`)).snapshot;
  assert.deepEqual(snapshotValues(snapshot), snapshotValues(authored), 'The saved template contains the authored body, properties and complete child hierarchy.');

  const choice = () => page.locator('.template-choice').filter({ has: page.getByRole('heading', { name: 'Immutable incident template', exact: true }) });
  async function gallery(state = 'active') {
    await page.goto(origin + '/app/templates', { waitUntil: 'networkidle' });
    await page.getByRole('combobox', { name: /^Show/ }).selectOption(state);
    await choice().click();
    await expect(page.locator('.template-preview').getByRole('heading', { name: 'Immutable incident template', exact: true, level: 2 })).toBeVisible();
  }
  const usedIds = new Set();
  function retainSourceIds(tree) {
    usedIds.add(tree.id);
    for (const block of tree.blocks) usedIds.add(block.id);
    tree.children.forEach(retainSourceIds);
  }
  retainSourceIds(authored);
  function freshIdentifiers(tree) {
    for (const id of [tree.id, ...tree.blocks.map(block => block.id)]) {
      assert.ok(!usedIds.has(id), 'Every copied page and block has a fresh identifier, including across uses.');
      usedIds.add(id);
    }
    tree.children.forEach(freshIdentifiers);
  }
  function flatten(tree) { return [tree, ...tree.children.flatMap(flatten)]; }
  async function visibleCopy(tree) {
    for (const document of flatten(tree)) {
      await page.goto(`${origin}/app/pages/${document.id}`, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(document.title);
      for (const block of document.blocks) {
        await expect(page.locator(`[data-block-id="${block.id}"]`).first()).toContainText(block.content.text.map(span => span.text).join(''));
      }
    }
  }
  const copies = [];
  for (let useIndex = 0; useIndex < 2; useIndex++) {
    await gallery();
    if (useIndex === 0) await accessible(page, 'custom template snapshot before use');
    await page.getByRole('button', { name: 'Use this template', exact: true }).click();
    const use = page.getByRole('dialog', { name: 'Use this template', exact: true });
    await use.getByRole('combobox', { name: /^Create in/ }).selectOption({ label: 'Snapshot destination' });
    const before = (await api(`/api/pages?containerId=${destinationId}`)).items.map(item => item.id);
    const applied = await nativeReceipt(`/api/templates/${templateId}/apply`, () => use.getByRole('button', { name: 'Create page', exact: true }).click());
    await expect(page).toHaveURL(new RegExp(`/app/pages/${applied.value.pageId}$`));
    const copied = await readTree(applied.value.pageId);
    assert.deepEqual(snapshotValues(copied), snapshotValues(snapshot), 'Application copies every stored value and preserves the complete ordered hierarchy.');
    assert.deepEqual(applied.value.pageIds, flatten(copied).map(item => item.id), 'The apply receipt names exactly the created hierarchy.');
    assert.equal(copied.page.revisionId, applied.receipt.revisionId);
    const after = (await api(`/api/pages?containerId=${destinationId}`)).items.map(item => item.id);
    assert.deepEqual(after.filter(id => !before.includes(id)).sort(), [...applied.value.pageIds].sort());
    freshIdentifiers(copied);
    copies.push(copied);
  }
  await visibleCopy(copies[0]);
  await accessible(page, 'template snapshot copied child');
  const retained = [];
  async function unchanged(stage) {
    for (const before of copies) {
      await visibleCopy(before);
      assert.deepEqual(await readTree(before.id), before, `${stage} changes no copied content, property, child identifier or page and block revision after reload.`);
    }
    retained.push(stage);
  }

  // Replace the source with different body, properties and no children, so an
  // accidental live link would visibly change the already-created hierarchy.
  const replacement = await ok(context, origin, 'POST', '/api/pages', {
    operationKey: randomUUID(), containerId: sourceSpace.id, title: 'Replacement source',
    properties: { icon: '🆕', labels: ['replacement'], typeface: 'mono', fullWidth: false },
    blocks: [{ id: randomUUID(), blockType: 'paragraph', content: { text: [{ text: 'New template content must not reach old copies.' }] }, treePosition: 'a' }],
  });
  await gallery();
  await page.getByRole('button', { name: 'Update from a page', exact: true }).click();
  const update = page.getByRole('dialog', { name: 'Update this template', exact: true });
  await update.locator('select[name="sourcePageId"]').selectOption(replacement.value.pageId);
  const updated = await nativeReceipt('/api/templates', () => update.getByRole('button', { name: 'Save updated template', exact: true }).click());
  assert.notEqual(updated.receipt.revisionId, saved.receipt.revisionId);
  assert.deepEqual(snapshotValues((await api(`/api/templates/${templateId}`)).snapshot), snapshotValues(await readTree(replacement.value.pageId, null, sourceSpace.id)));
  await unchanged('update');

  await gallery();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  const archive = page.getByRole('dialog', { name: 'Archive template', exact: true });
  await nativeReceipt(`/api/templates/${templateId}/change`, () => archive.getByRole('button', { name: 'Archive', exact: true }).click());
  assert.ok((await api(`/api/templates/${templateId}`)).archivedAt);
  await unchanged('archive');

  await gallery('archived');
  await page.getByRole('button', { name: 'Delete template', exact: true }).click();
  const remove = page.getByRole('dialog', { name: 'Delete template', exact: true });
  await nativeReceipt(`/api/templates/${templateId}/change`, () => remove.getByRole('button', { name: 'Delete', exact: true }).click());
  assert.ok((await api('/api/templates?state=deleted')).items.some(item => item.id === templateId));
  const deleted = await context.request.get(`${origin}/api/templates/${templateId}`);
  assert.equal(deleted.status(), 404);
  await unchanged('delete');
  assert.deepEqual(await readTree(sourceIds[0], null, sourceSpace.id), authored, 'Template use and management leave every original source page unchanged.');
  await accessible(page, 'template snapshot retained after deletion');
  await writeFile(`.artifacts/ui-convergence/template-snapshot-${width}.json`, JSON.stringify({
    width, templateId, expectedSources, snapshot, receipts, copies, retained,
  }, null, 2));
  console.log(`PROBE TMPL-003 snapshot: native apply twice -> two independent four-page trees with complete body and properties at ${width}px`);
  console.log(`PROBE TMPL-003 retention: native update, archive and delete -> both copied trees, values, identifiers and revisions unchanged after reload at ${width}px`);
}
