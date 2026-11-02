import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { openNavigation } from './browser-support.mjs';
import { accessible } from './browser-evidence.mjs';
import { call, ok, withSecondPerson } from './two-people-support.mjs';

/** Shared explicit order survives native drag, re-parenting and content changes. */
export async function treeOrderJourney(state) {
  const { context, origin, api } = state;
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const welcome = (await api(`/api/pages?containerId=${space.id}`)).items.find(item => item.title === 'Welcome');
  const create = async (title, parentPageId = null) => (await ok(context, origin, 'POST', '/api/pages', {
    operationKey: randomUUID(), containerId: space.id, title, parentPageId,
    blocks: [{ id: randomUUID(), blockType: 'paragraph', treePosition: 'a0', content: { text: [{ text: 'Original tree content' }] } }],
  })).value.pageId;
  const a = await create('Alpha branch'), b = await create('Beta branch'), c = await create('Gamma branch');
  const child = await create('Retained child', c), grandchild = await create('Retained grandchild', child);
  await ok(context, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: 'browser-reader', level: 'view' });
  const listing = person => ok(person.context, origin, 'GET', `/api/pages?containerId=${space.id}`);
  const group = page => page.getByRole('navigation', { name: 'Pages', exact: true }).locator('.space-group')
    .filter({ has: page.getByRole('textbox', { name: 'Filter pages in Handbook', exact: true }) });
  const row = (page, id) => group(page).locator('.tree-row').filter({ has: page.locator(`a[href="/app/pages/${id}"]`) });
  const topology = items => items.map(item => ({ id: item.id, parentPageId: item.parentPageId, treePosition: item.treePosition })).sort((a, b) => a.id.localeCompare(b.id));
  async function open(person) {
    await person.page.goto(origin + '/app', { waitUntil: 'networkidle' });
    await openNavigation(person.page);
  }
  async function confirm(page) {
    await page.getByRole('dialog', { name: 'Move in tree', exact: true }).getByRole('button', { name: 'Review access changes', exact: true }).click();
    const reviewed = page.getByRole('dialog', { name: 'Review tree move', exact: true });
    await expect(reviewed.getByText('The page and its children move together.', { exact: true })).toBeVisible();
    const loaded = page.waitForEvent('load');
    await reviewed.getByRole('button', { name: 'Confirm tree move', exact: true }).click();
    await loaded;
    await page.waitForLoadState('networkidle');
    await openNavigation(page);
  }
  async function assertOrder(people, roots, children) {
    for (const person of [people.alice, people.bob]) {
      await open(person);
      const items = (await listing(person)).items;
      assert.deepEqual(items.filter(item => !item.parentPageId).map(item => item.id), roots, 'Both members read exactly the stored root order.');
      for (const [parent, ids] of children) assert.deepEqual(items.filter(item => item.parentPageId === parent).map(item => item.id), ids, 'Every nested sibling cohort has its own durable order.');
      const walk = async parent => {
        const result = [];
        for (const id of parent === null ? roots : children.get(parent) ?? []) {
          result.push(id);
          const descendants = children.get(id) ?? [];
          if (descendants.length) {
            const toggle = row(person.page, id).locator('button[aria-expanded]');
            await expect(toggle).toBeEnabled();
            if (await toggle.getAttribute('aria-expanded') === 'false') {
              await toggle.click();
              await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            }
            result.push(...await walk(id));
          }
        }
        return result;
      };
      const expected = await walk(null);
      assert.deepEqual(await group(person.page).locator('.tree-row > a').evaluateAll(links => links.map(link => link.getAttribute('href').split('/').at(-1))), expected, 'Native tree traversal matches the complete expected order for each member.');
      for (const item of items) {
        const parent = await row(person.page, item.id).evaluate(element => element.closest('li').parentElement.closest('li')?.querySelector(':scope > .tree-row > a')?.getAttribute('href').split('/').at(-1) ?? null);
        assert.equal(parent, item.parentPageId, 'The rendered parent agrees with the canonical parent after the move.');
      }
    }
  }
  await withSecondPerson(state, state.page.viewportSize().width, async people => {
    const owner = people.alice, reader = people.bob;
    const originalChildren = new Map([[c, [child]], [child, [grandchild]]]);
    await assertOrder(people, [welcome.id, a, b, c], originalChildren);
    const originalPosition = (await listing(owner)).items.find(item => item.id === c).treePosition;
    await open(owner);
    await row(owner.page, c).dragTo(row(owner.page, a), { targetPosition: { x: 20, y: 2 } });
    await confirm(owner.page);
    await assertOrder(people, [welcome.id, c, a, b], originalChildren);
    const movedPosition = (await listing(owner)).items.find(item => item.id === c).treePosition;
    assert.ok(typeof movedPosition === 'string' && movedPosition !== originalPosition, 'Dragging stores a new explicit sibling position.');
    await open(owner);
    await row(owner.page, c).hover();
    await row(owner.page, c).getByRole('button', { name: 'Move Gamma branch in tree', exact: true }).click();
    const dialog = owner.page.getByRole('dialog', { name: 'Move in tree', exact: true });
    await dialog.getByRole('combobox', { name: 'Parent page', exact: true }).selectOption(b);
    await dialog.getByRole('combobox', { name: 'Position', exact: true }).selectOption('');
    await confirm(owner.page);
    const nested = new Map([[b, [c]], [c, [child]], [child, [grandchild]]]);
    const roots = [welcome.id, a, b];
    await assertOrder(people, roots, nested);
    const retained = topology((await listing(owner)).items);
    let document = await api(`/api/pages/${a}`);
    await ok(context, origin, 'PATCH', `/api/pages/${a}`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, properties: { title: 'Zulu renamed branch' } });
    assert.equal((await api(`/api/pages/${a}`)).page.title, 'Zulu renamed branch');
    assert.deepEqual(topology((await listing(owner)).items), retained, 'Renaming never implicitly reorders siblings.');
    document = await api(`/api/pages/${b}`);
    const block = document.blocks[0];
    await ok(context, origin, 'PATCH', `/api/pages/${b}/blocks/${block.id}`, { operationKey: randomUUID(), expectedRevisionId: block.revisionId, content: { text: [{ text: 'Edited tree content' }] } });
    assert.deepEqual((await api(`/api/pages/${b}`)).blocks[0].content, { text: [{ text: 'Edited tree content' }] });
    assert.deepEqual(topology((await listing(owner)).items), retained, 'Body editing preserves every stored order and parent.');
    document = await api(`/api/pages/${a}`);
    await ok(context, origin, 'POST', `/api/pages/${a}/publish`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId });
    const published = await api(`/api/pages/${a}`);
    assert.equal(published.page.lifecycle, 'live');
    assert.notEqual(published.publishedRevisionId, document.publishedRevisionId, 'Publication committed a new published revision.');
    assert.deepEqual(topology((await listing(owner)).items), retained, 'Publishing preserves every stored order and parent.');
    await assertOrder(people, roots, nested);
    await expect(row(reader.page, c)).toHaveAttribute('draggable', 'false');
    await row(reader.page, c).getByRole('link').focus();
    await expect(row(reader.page, c).getByRole('button', { name: 'Move Gamma branch in tree', exact: true })).toBeDisabled();
    const input = { containerId: space.id, parentPageId: null, beforeId: a };
    const preview = await ok(context, origin, 'POST', `/api/pages/${c}/move-preview`, input);
    document = await api(`/api/pages/${c}`);
    const operationKey = randomUUID();
    const refused = await call(reader.context, origin, 'POST', `/api/pages/${c}/move`, { operationKey, expectedRevisionId: document.page.revisionId, ...input, accessPreviewHash: preview.accessPreviewHash, orderPreviewHash: preview.orderPreviewHash });
    assert.equal(refused.status, 404, 'A view-only member cannot execute an otherwise valid reviewed move.');
    assert.equal(refused.body.code, 'NOT_FOUND');
    assert.deepEqual((await api(`/api/pages/${c}`)).page, document.page, 'Refused movement changes no page revision.');
    assert.ok(!(await api('/api/activity?action=pages.move&limit=100')).items.some(item => item.operationKey === operationKey), 'Refused movement emits no committed activity.');
    assert.deepEqual(topology((await listing(owner)).items), retained, 'Refused movement changes no page placement.');
    await assertOrder(people, roots, nested);
    await accessible(owner.page, 'shared explicit page order');
  });
  console.log('PROBE TREE-002 1: native drag and Move in tree -> shared stored sibling order and moved subtree survive rename, body edit, publish and reload');
  console.log('PROBE TREE-002 2: two member trees and view-only move refusal -> identical explicit order, one parent per page and no unauthorized placement change');
}
