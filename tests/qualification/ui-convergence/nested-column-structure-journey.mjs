import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { ok } from './two-people-support.mjs';

const shape = blocks => blocks.map(({ id, blockType, content, parentBlockId }) => ({ id, blockType, content, parentBlockId: parentBlockId ?? null }));

/** Mixed ordinary nesting and columns share the native subtree journey. */
export async function nestedColumnStructureJourney({ page, context, origin, api }, width) {
  const container = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const [p, q, s, l, x, r, y] = Array.from({ length: 7 }, () => randomUUID());
  const paragraph = (id, text, parentBlockId) => ({ id, blockType: 'paragraph', content: { text: [{ text }] }, parentBlockId });
  const original = [
    paragraph(p, 'Coordinate the response plan.', null),
    paragraph(q, 'Record the next response update.', p),
    { id: s, blockType: 'columns', content: { count: 2 }, parentBlockId: p },
    { id: l, blockType: 'column', content: {}, parentBlockId: s },
    paragraph(x, 'Engineering confirms the rollback.', l),
    { id: r, blockType: 'column', content: {}, parentBlockId: s },
    paragraph(y, 'Support prepares the customer update.', r),
  ];
  const { value: { pageId } } = await ok(context, origin, 'POST', '/api/pages', {
    operationKey: randomUUID(), containerId: container.id, title: 'Nested response responsibilities',
    blocks: original.map((block, index) => ({ ...block, treePosition: String(index) })),
  });
  const row = id => page.locator(`.block-row[data-block-id="${id}"]`);
  const handle = id => row(id).getByRole('button', { name: /^Block actions for/ });
  const read = () => api(`/api/pages/${pageId}`);
  let expected = structuredClone(original);
  async function reconcile(label) {
    assert.deepEqual(shape((await read()).blocks), expected, `${label}: commit retains the complete ordered tree.`);
    await page.reload({ waitUntil: 'networkidle' });
    const saved = (await read()).blocks;
    assert.deepEqual(shape(saved), expected, `${label}: reload retains every identifier, type, content and immediate parent.`);
    assert.deepEqual([...saved].sort((a, b) => a.treePosition.localeCompare(b.treePosition)).map(block => block.id), expected.map(block => block.id));
    assert.deepEqual(await page.locator('.block-row').evaluateAll(rows => rows.map(row => row.dataset.blockId)), expected.filter(block => block.blockType !== 'column').map(block => block.id));
    for (const block of expected.filter(block => block.blockType === 'paragraph')) {
      await expect(row(block.id).locator('[data-slate-editable]')).toHaveText(block.content.text.map(span => span.text).join(''));
      const column = expected.find(parent => parent.id === block.parentBlockId && parent.blockType === 'column');
      assert.equal(await row(block.id).evaluate(element => element.closest('.slate-column')?.dataset.columnId ?? null), column?.id ?? null, `${label}: rendered layout matches the saved parent.`);
    }
  }
  async function action(id, name, capture) {
    await handle(id).click();
    if (capture) await page.screenshot({ path: `.artifacts/ui-convergence/nested-columns-${width}-${capture}-menu.png`, fullPage: true });
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/pages/${pageId}/blocks` && response.request().method() === 'PUT');
    await page.getByRole('menuitem', { name, exact: true }).click();
    const response = await pending;
    assert.equal(response.status(), 200, await response.text());
    assert.equal((await response.json()).value.pageId, pageId);
  }
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await reconcile('Loaded ordinary parent with nested columns');
  await action(q, 'Move down', 'move');
  expected = [expected[0], ...expected.slice(2), expected[1]];
  await reconcile('Move down passes the entire columns branch without reparenting its ordinary sibling');
  await page.screenshot({ path: `.artifacts/ui-convergence/nested-columns-${width}-moved.png`, fullPage: true });

  await action(y, 'Delete', 'delete');
  expected = expected.filter(block => block.id !== y);
  await reconcile('Deleting the last column paragraph removes exactly that block and retains the unrelated sibling');
  await expect(row(y)).toHaveCount(0);
  await expect(row(q)).toBeVisible();
  await page.screenshot({ path: `.artifacts/ui-convergence/nested-columns-${width}-deleted.png`, fullPage: true });

  // The same parent reconstruction also determines the branch a copy owns.
  await action(s, 'Duplicate');
  const copied = (await read()).blocks.filter(block => !original.some(source => source.id === block.id));
  const branch = expected.slice(1, -1);
  assert.equal(copied.length, branch.length, 'Copying nested columns does not copy their ordinary sibling.');
  const ids = new Map(branch.map((block, index) => [block.id, copied[index].id]));
  assert.equal(new Set(copied.map(block => block.id)).size, branch.length);
  expected.splice(expected.length - 1, 0, ...branch.map(block => ({ ...structuredClone(block), id: ids.get(block.id), parentBlockId: ids.get(block.parentBlockId) ?? block.parentBlockId })));
  await reconcile('Copying nested columns remaps only internal parents and retains all originals');
  await action(ids.get(s), 'Delete');
  expected = expected.filter(block => !copied.some(copy => copy.id === block.id));
  await reconcile('Deleting copied nested columns retains the original branch and its ordinary sibling');
  console.log(`BLOCK-001 mixed nested columns move, delete and copy passed at ${width}px`);
}
