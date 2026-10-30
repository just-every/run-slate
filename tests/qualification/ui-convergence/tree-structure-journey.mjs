import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { signInWithOutbox } from '../../e2e/outbox-auth.mjs';
import { openNavigation } from './browser-support.mjs';
import { accessible } from './browser-evidence.mjs';
import { ok, withSecondPerson } from './two-people-support.mjs';

/** Native creation, complete tree reconciliation and two members' durable preferences. */
export async function treeStructureJourney(state) {
  const { context, origin } = state;
  const spaces = [];
  const nodes = [];
  for (const name of ['Tree operations', 'Tree reference']) {
    const created = (await ok(context, origin, 'POST', '/api/containers', { operationKey: randomUUID(), name })).value;
    const space = { id: created.id, name };
    nodes.push({ id: created.homePageId, containerId: space.id, title: `${name} home`, parentPageId: null, icon: null });
    spaces.push(space);
    await ok(context, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: 'browser-reader', level: 'view' });
  }
  async function create(space, title, parent = null) {
    const icon = nodes.length % 3 === 0 ? null : nodes.length % 2 ? '🌲' : '📘';
    const input = { operationKey: randomUUID(), containerId: space.id, title, parentPageId: parent?.id ?? null, properties: { icon } };
    const id = (await ok(context, origin, 'POST', '/api/pages', input)).value.pageId;
    const node = { id, containerId: space.id, title, parentPageId: input.parentPageId, icon };
    nodes.push(node);
    return node;
  }
  // A branching sixteen-level spine goes well beyond the old three-level filter
  // fixture. The product's recursive traversal has no artificial depth ceiling.
  const spine = [];
  for (let depth = 0; depth < 16; depth++) {
    spine.push(await create(spaces[0], `Tree level ${String(depth + 1).padStart(2, '0')}`, spine.at(-1)));
    if ([0, 3, 7, 11].includes(depth)) await create(spaces[0], `Side leaf ${depth + 1}`, spine.at(-1));
  }
  const branch = [await create(spaces[0], 'Reference branch')];
  for (let depth = 1; depth <= 3; depth++) branch.push(await create(spaces[0], `Reference child ${depth}`, branch.at(-1)));
  await create(spaces[0], 'Repeated title');
  await create(spaces[0], 'Repeated title', branch[0]);
  const otherRoot = await create(spaces[1], 'Other tree root');
  await create(spaces[1], 'Other tree child', otherRoot);
  const parents = nodes.filter(node => nodes.some(child => child.parentPageId === node.id));
  const sorted = rows => rows.slice().sort((a, b) => a.id.localeCompare(b.id));
  const projection = item => ({ id: item.id, containerId: item.containerId, title: item.title, parentPageId: item.parentPageId ?? null, icon: item.icon ?? null });
  async function canonical(person) {
    const all = (await ok(person.context, origin, 'GET', '/api/pages')).items;
    for (const space of spaces) {
      const expected = nodes.filter(node => node.containerId === space.id);
      const scoped = (await ok(person.context, origin, 'GET', `/api/pages?containerId=${space.id}`)).items;
      assert.deepEqual(sorted(scoped.map(projection)), sorted(expected), 'The complete native container listing matches every created node and its single parent.');
      assert.deepEqual(sorted(all.filter(item => item.containerId === space.id).map(projection)), sorted(expected), 'Global and container listings agree without omission or duplication.');
    }
    for (const node of nodes) {
      const document = await ok(person.context, origin, 'GET', `/api/pages/${node.id}`);
      assert.equal(document.parentPageId, node.parentPageId);
      assert.equal(document.page.containerId, node.containerId);
      assert.equal(document.page.title, node.title);
      assert.equal(document.properties.icon ?? null, node.icon);
    }
  }
  const group = (page, space) => page.getByRole('navigation', { name: 'Pages', exact: true }).locator('.space-group')
    .filter({ has: page.getByRole('textbox', { name: `Filter pages in ${space.name}`, exact: true }) });
  const row = (page, node) => group(page, spaces.find(space => space.id === node.containerId))
    .locator('.tree-row').filter({ has: page.locator(`a[href="/app/pages/${node.id}"]`) });
  async function open(person) {
    await person.page.goto(origin + '/app', { waitUntil: 'networkidle' });
    await openNavigation(person.page);
  }
  async function toggle(person, node, expanded) {
    const control = row(person.page, node).locator('button[aria-expanded]');
    await expect(control).toHaveAccessibleName(`${expanded ? 'Expand' : 'Collapse'} ${node.title}`);
    await control.click();
    await expect(control).toHaveAttribute('aria-expanded', String(expanded));
    assert.deepEqual(await ok(person.context, origin, 'GET', `/api/pages/${node.id}/expansion`), { expanded });
  }
  function visible(node, expanded) {
    return !node.parentPageId || (expanded.has(node.parentPageId) && visible(nodes.find(parent => parent.id === node.parentPageId), expanded));
  }
  async function inventory(person, expanded) {
    for (const space of spaces) {
      const expected = nodes.filter(node => node.containerId === space.id && visible(node, expanded)).map(node => ({
        id: node.id, title: node.title, parentPageId: node.parentPageId, icon: node.icon,
        hasChildren: parents.some(parent => parent.id === node.id),
        expanded: parents.some(parent => parent.id === node.id) ? expanded.has(node.id) : null,
      }));
      await expect.poll(async () => group(person.page, space).locator('.tree-row > a').count()).toBe(expected.length);
      const actual = await group(person.page, space).locator('.tree-row > a').evaluateAll(links => links.map(link => {
        const item = link.closest('li');
        const parent = item.parentElement.closest('li')?.querySelector(':scope > .tree-row > a');
        const control = link.parentElement.querySelector('button[aria-expanded]');
        const icon = link.querySelector('.stored-page-icon');
        return {
          id: link.getAttribute('href').split('/').at(-1), title: link.querySelector('span:not(.stored-page-icon)').textContent,
          parentPageId: parent?.getAttribute('href').split('/').at(-1) ?? null,
          icon: icon?.textContent ?? null, hasChildren: !!control,
          expanded: control ? control.getAttribute('aria-expanded') === 'true' : null,
          defaultIcon: !icon && !!link.querySelector('svg'),
        };
      }));
      assert.equal(new Set(actual.map(node => node.id)).size, actual.length, 'Each page appears exactly once in its own tree, including repeated titles.');
      for (const node of actual) if (node.icon === null) assert.ok(node.defaultIcon, 'A page with no custom icon still shows its page icon.');
      assert.deepEqual(sorted(actual.map(({ defaultIcon, ...node }) => node)), sorted(expected), 'Every visible node retains its native title, icon, parent and child indicator.');
    }
    for (const node of parents) assert.deepEqual(await ok(person.context, origin, 'GET', `/api/pages/${node.id}/expansion`), { expanded: expanded.has(node.id) }, 'Expansion belongs to this member, even while its ancestor is collapsed.');
  }
  await withSecondPerson(state, state.page.viewportSize().width, async people => {
    const owner = people.alice, reader = people.bob;
    await canonical(owner);
    await canonical(reader);
    await open(owner);
    await open(reader);
    await inventory(owner, new Set());
    await inventory(reader, new Set());
    const ownerExpanded = new Set();
    for (const node of parents) {
      await toggle(owner, node, true);
      ownerExpanded.add(node.id);
    }
    await inventory(owner, ownerExpanded);
    await inventory(reader, new Set());
    // Exercise collapse and re-expansion inside the spine, retaining every
    // descendant's own preference while removing the entire visible subtree.
    await toggle(owner, spine[7], false);
    ownerExpanded.delete(spine[7].id);
    await inventory(owner, ownerExpanded);
    await toggle(owner, spine[7], true);
    ownerExpanded.add(spine[7].id);
    await inventory(owner, ownerExpanded);
    const deepest = row(owner.page, spine.at(-1)).getByRole('link');
    await deepest.scrollIntoViewIfNeeded();
    assert.ok(await deepest.evaluate(link => {
      const title = link.querySelector('span:not(.stored-page-icon)');
      return title.clientWidth >= title.scrollWidth;
    }), 'The deepest node still displays its title; indentation must not consume the entire row.');
    await accessible(owner.page, 'complete deep branching page tree');
    const readerExpanded = new Set([branch[0].id, otherRoot.id]);
    for (const node of [branch[0], otherRoot]) await toggle(reader, node, true);
    await toggle(owner, branch[0], false);
    ownerExpanded.delete(branch[0].id);
    await inventory(owner, ownerExpanded);
    await inventory(reader, readerExpanded);
    for (const [person, expanded] of [[owner, ownerExpanded], [reader, readerExpanded]]) {
      await person.page.reload({ waitUntil: 'networkidle' });
      await openNavigation(person.page);
      await inventory(person, expanded);
    }
    await accessible(reader.page, 'independent member tree expansion');
    // New native sign-ins and empty browser contexts prove persistence beyond
    // the original sessions and any tab-local state. Only the mail edge is fake.
    for (const [identity, expanded] of [['owner', ownerExpanded], ['reader', readerExpanded]]) {
      const fresh = await context.browser().newContext({ viewport: state.page.viewportSize() });
      try {
        const session = await signInWithOutbox(origin, [identity, 'test.invalid'].join('@'));
        await fresh.addCookies([{ name: 'slate_session', value: session.cookie.split('=')[1], url: origin }]);
        const person = { context: fresh, page: await fresh.newPage() };
        await open(person);
        await canonical(person);
        await inventory(person, expanded);
      } finally { await fresh.close(); }
    }
  });
  console.log(`PROBE TREE-001 1: native expansion controls and fresh member sessions -> independent persisted expansion, icons and child indicators for ${nodes.length} pages`);
  console.log(`PROBE TREE-001 2: native page listings and complete rendered inventories -> exactly one parent and one location for every page in two containers`);
  console.log('PROBE TREE-001 3: native sixteen-level branching tree -> complete expansion, collapse, descendant restoration and independent member read-back');
}
