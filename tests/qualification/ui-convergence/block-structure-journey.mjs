import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { expect } from '@playwright/test';
import { accessible, closeDetails } from './browser-support.mjs';
import { ok } from './two-people-support.mjs';

const shape = blocks => blocks.map(({ id, blockType, content, parentBlockId }) => ({ id, blockType, content, parentBlockId: parentBlockId ?? null }));

/** Real handles, menus, selection and download, reconciled with the committed tree. */
export async function blockStructureJourney(state, width) {
  const { page, context, origin, api } = state;
  const container = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const [a, b, c, d] = Array.from({ length: 4 }, () => randomUUID());
  const paragraph = (id, text) => ({ id, blockType: 'paragraph', content: { text: [{ text }] }, parentBlockId: null });
  const original = [
    paragraph(a, 'Open the response plan.'),
    { id: b, blockType: 'heading', content: { level: 2, text: [{ text: 'Response responsibilities' }] }, parentBlockId: null },
    paragraph(c, 'Assign the response owner.'),
    paragraph(d, 'Record the next update.'),
  ];
  const { value: { pageId } } = await ok(context, origin, 'POST', '/api/pages', {
    operationKey: randomUUID(), containerId: container.id, title: 'Response block structure',
    blocks: original.map((block, index) => ({ ...block, treePosition: String(index) })),
  });
  const row = id => page.locator(`.block-row[data-block-id="${id}"]`);
  const input = id => row(id).locator('[data-slate-editable]').first();
  const handle = id => row(id).getByRole('button', { name: /^Block actions for/ });
  const read = () => api(`/api/pages/${pageId}`);
  let expected = structuredClone(original);
  async function reconcile(label) {
    assert.deepEqual(shape((await read()).blocks), expected, `${label}: the completed mutation commits the expected tree.`);
    await page.reload({ waitUntil: 'networkidle' });
    const committed = (await read()).blocks;
    assert.deepEqual(shape(committed), expected, `${label}: reload retains every identifier, type, content and parent in order.`);
    assert.equal(new Set(committed.map(block => block.id)).size, committed.length);
    assert.deepEqual([...committed].sort((left, right) => left.treePosition.localeCompare(right.treePosition)).map(block => block.id), expected.map(block => block.id));
    assert.deepEqual(await page.locator('.block-row').evaluateAll(rows => rows.map(row => row.dataset.blockId)), expected.map(block => block.id), `${label}: rendered order matches the saved tree.`);
    for (const block of expected) {
      await expect(input(block.id)).toHaveText(block.content.text.map(span => span.text).join(''));
      await expect(handle(block.id)).toHaveAttribute('draggable', 'true');
      await expect(handle(block.id)).toHaveAttribute('data-tooltip', 'Block actions');
    }
  }
  async function committed(perform) {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/pages/${pageId}/blocks` && response.request().method() === 'PUT');
    await perform();
    const response = await pending;
    assert.equal(response.status(), 200, await response.text());
    assert.equal((await response.json()).value.pageId, pageId);
  }
  async function action(id, name) {
    await handle(id).click();
    await committed(() => page.getByRole('menuitem', { name, exact: true }).click());
  }
  const drag = (id, target) => committed(() => handle(id).dragTo(row(target)));
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await reconcile('Initial typed blocks');
  await handle(a).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(handle(a)).toBeFocused();
  await expect.poll(() => handle(a).evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
  await page.screenshot({ path: `.artifacts/ui-convergence/block-structure-${width}-handle.png`, fullPage: true });

  // Make an actual selected-text comment before editing or moving its source.
  const quote = 'Open the response';
  await input(a).focus();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let index = 0; index < quote.length; index++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('toolbar', { name: 'Formatting for the selected text' }).getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.locator('.comment-form blockquote')).toHaveText(quote);
  await page.getByRole('textbox', { name: 'Comment text', exact: true }).fill('Keep the response plan attached to this discussion.');
  await page.getByRole('button', { name: 'Send comment', exact: true }).click();
  await expect(page.locator('.comment-thread')).toContainText('Keep the response plan attached to this discussion.');
  const discussion = await api(`/api/comments/page/${pageId}`);
  assert.equal(discussion.threads.length, 1);
  const thread = discussion.threads[0], anchor = JSON.parse(thread.anchor_json);
  assert.equal(thread.kind, 'inline');
  assert.equal(thread.block_id, a);
  assert.equal(anchor.quote, quote);
  expected[0].content.text = [{ text: quote, commentAnchorId: anchor.anchorId }, { text: ' plan.' }];
  await closeDetails(page);
  await reconcile('Anchored source');
  await input(a).click();
  await page.keyboard.press('ControlOrMeta+End');
  const editing = page.waitForResponse(response => new URL(response.url()).pathname === `/api/pages/${pageId}/blocks/${a}` && response.request().method() === 'PATCH' && response.request().postData()?.includes('Keep the trail.'));
  await page.keyboard.type(' Keep the trail.');
  const edited = await editing;
  assert.equal(edited.status(), 200, await edited.text());
  expected[0].content.text[1].text += ' Keep the trail.';
  await reconcile('Editing keeps the source identifier and comment mark');
  await action(a, 'Move down');
  expected = [expected[1], expected[0], ...expected.slice(2)];
  await reconcile('Moving the anchored source down retains its identifier');
  await action(a, 'Move up');
  expected = [expected[1], expected[0], ...expected.slice(2)];
  await reconcile('Moving the anchored source back retains its identifier');

  await action(c, /^Indent/);
  expected[2].parentBlockId = b;
  await reconcile('Indent nests the original child');
  await action(c, /^Outdent/);
  expected[2].parentBlockId = null;
  await reconcile('Outdent returns the same child to the root');
  await action(c, /^Indent/);
  expected[2].parentBlockId = b;
  await reconcile('Re-nest the original child');

  await drag(d, a);
  expected = [expected[3], ...expected.slice(0, 3)];
  await reconcile('Native handle drag reorders roots');
  await action(b, 'Move up');
  expected = [expected[0], expected[2], expected[3], expected[1]];
  await reconcile('Moving a parent up keeps its ordered subtree');
  await action(b, 'Move down');
  expected = [expected[0], expected[3], expected[1], expected[2]];
  await reconcile('Moving a parent down keeps its ordered subtree');

  await drag(b, d);
  expected = [...expected.slice(2), ...expected.slice(0, 2)];
  await reconcile('Native drag carries the complete subtree before another root');
  await drag(b, a);
  expected = [...expected.slice(2), ...expected.slice(0, 2)];
  await reconcile('Native drag carries the complete subtree after another root');

  // Click the row padding, outside the editable, then extend across neighbours.
  const select = async (id, modifiers = []) => {
    const content = row(id).locator('.block-content');
    const box = await content.boundingBox(), text = await input(id).boundingBox();
    assert.ok(box && text);
    // The text's trailing margin stays clear of the phone's visible handles.
    const position = { x: text.x + text.width - box.x + 2, y: text.y + text.height / 2 - box.y };
    assert.ok(position.x < box.width);
    await content.click({ position, modifiers });
  };
  await select(a);
  await expect(row(a)).toHaveAttribute('data-selected', 'true');
  await select(c, ['Shift']);
  assert.deepEqual(await page.locator('.block-row[data-selected=true]').evaluateAll(rows => rows.map(row => row.dataset.blockId)), [a, b, c]);
  assert.deepEqual(shape((await read()).blocks), expected, 'Selecting adjacent blocks does not write or replace them.');
  await accessible(page, 'selected adjacent blocks');

  await action(a, 'Duplicate');
  assert.equal((await read()).blocks.length, 5);
  const anchoredCopy = (await read()).blocks.find(block => !original.some(source => source.id === block.id));
  assert.ok(anchoredCopy);
  expected.splice(2, 0, { ...structuredClone(expected[1]), id: anchoredCopy.id,
    content: { text: expected[1].content.text.map(({ commentAnchorId, ...span }) => span) } });
  await reconcile('Copying anchored text creates a fresh block without moving its discussion');
  assert.deepEqual(await api(`/api/comments/page/${pageId}`), discussion);
  await action(anchoredCopy.id, 'Delete');
  expected.splice(2, 1);
  await reconcile('Deleting the independent copy leaves the anchored source');

  await action(b, 'Duplicate');
  assert.equal((await read()).blocks.length, 6);
  const copied = (await read()).blocks.filter(block => !original.some(source => source.id === block.id));
  assert.equal(copied.length, 2, 'Duplicating a parent copies its child with fresh identifiers.');
  const [copyParent, copyChild] = copied;
  assert.notEqual(copyParent.id, copyChild.id);
  expected.push({ ...structuredClone(expected[2]), id: copyParent.id }, { ...structuredClone(expected[3]), id: copyChild.id, parentBlockId: copyParent.id });
  await reconcile('Duplicate creates an independent ordered subtree');
  await action(copyParent.id, 'Delete');
  expected = expected.slice(0, 4);
  await reconcile('Delete removes the copied subtree and retains every original');
  await action(d, 'Delete');
  expected = expected.slice(1);
  await reconcile('Delete removes only the selected root');

  const retained = await api(`/api/comments/page/${pageId}`);
  assert.deepEqual(retained, discussion, 'Block edits and moves retain the actual anchored discussion unchanged.');
  await expect(input(a).locator('mark')).toHaveAttribute('data-comment-anchor', anchor.anchorId);
  await expect(input(a).locator('mark')).toHaveText(quote);
  await accessible(page, 'retained block tree');

  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export page', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export readable content', exact: true });
  await dialog.getByLabel('Format', { exact: true }).selectOption('html');
  await expect(dialog.getByRole('checkbox', { name: 'Include comments', exact: true })).toBeChecked();
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download export', exact: true }).click();
  const download = await downloading;
  const entries = unzipSync(await readFile(await download.path()));
  const decode = entry => new TextDecoder().decode(entries[entry]);
  const manifest = JSON.parse(decode('slate-readable.json'));
  assert.equal(manifest.pages.length, 1);
  const exported = manifest.pages[0];
  assert.equal(exported.id, pageId);
  assert.deepEqual(shape(exported.blocks), expected, 'The downloaded manifest retains the committed identifiers, ordered tree and content.');
  assert.deepEqual(exported.blocks.map(block => block.treePosition), (await read()).blocks.map(block => block.treePosition));
  const comments = JSON.parse(decode(`pages/${pageId}.comments.json`));
  assert.deepEqual(comments, exported.comments);
  assert.equal(comments.threads.length, 1);
  assert.equal(comments.threads[0].id, thread.id);
  assert.equal(comments.threads[0].blockId, a);
  assert.deepEqual(comments.threads[0].anchor, anchor);
  assert.equal(comments.threads[0].orphaned, false);
  assert.deepEqual(comments.threads[0].comments[0].body, discussion.comments[0].body);
  const archivedComment = comments.threads[0].comments[0], sourceComment = discussion.comments[0];
  assert.equal(archivedComment.id, sourceComment.id);
  assert.equal(archivedComment.parentCommentId, sourceComment.parentCommentId);
  assert.equal(archivedComment.authorId, sourceComment.authorMemberId);
  assert.equal(comments.authors.find(author => author.id === archivedComment.authorId)?.displayName, sourceComment.authorDisplayName);
  assert.equal(archivedComment.createdAt, sourceComment.createdAt);
  assert.equal(archivedComment.updatedAt, sourceComment.updatedAt);
  assert.equal(archivedComment.deletedAt, sourceComment.deletedAt);
  const output = await context.newPage();
  try {
    await output.setContent(decode(`pages/${pageId}.html`));
    assert.deepEqual(await output.locator('[id^="slate-block-"]').evaluateAll(elements => elements.map(element => element.id)), expected.map(block => `slate-block-${block.id}`), 'The readable document renders each retained identifier in committed order.');
    for (const block of expected) await expect(output.locator(`#slate-block-${block.id}`)).toContainText(block.content.text.map(span => span.text).join(''));
    const link = output.getByRole('link', { name: 'Inline thread', exact: true });
    await expect(link).toHaveAttribute('href', `#slate-block-${a}`);
    await link.click();
    await expect(output.locator(`#slate-block-${a}`)).toBeInViewport();
    await expect(output.getByRole('region', { name: 'Comments', exact: true })).toContainText('Keep the response plan attached to this discussion.');
    await output.screenshot({ path: `.artifacts/ui-convergence/block-structure-${width}-export.png`, fullPage: true });
  } finally { await output.close(); }
  await expect(dialog).toHaveCount(0);
  console.log(`BLOCK-001 ordered tree, structural actions, retained identifiers and anchored export passed at ${width}px`);
}
