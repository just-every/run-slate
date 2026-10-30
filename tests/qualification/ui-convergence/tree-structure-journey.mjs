import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { openNavigation } from './browser-support.mjs';
import { accessible } from './browser-evidence.mjs';
import { call, ok, withSecondPerson } from './two-people-support.mjs';

/** A populated native tree, moved by an ordinary editor and read by another member. */
export async function treeStructureJourney(state) {
  const { origin } = state, width = state.page.viewportSize().width;
  const directory = path.join(root, '.artifacts/ui-convergence/tree-structure', String(width));
  await mkdir(directory, { recursive: true });
  const evidence = { width, moves: [], snapshots: [], refusals: [] };
  const owner = state.context;
  const space = (await ok(owner, origin, 'POST', '/api/containers', {
    operationKey: randomUUID(), name: 'Tree operations', visibility: 'private',
  })).value.id;
  const home = (await ok(owner, origin, 'GET', `/api/pages?containerId=${space}`)).items;
  assert.equal(home.length, 1, 'The native space starts with its home page.');
  const titles = new Map(home.map(item => [item.id, item.title]));
  const create = async (title, treePosition, parentPageId = null) => {
    const body = await ok(owner, origin, 'POST', '/api/pages', {
      operationKey: randomUUID(), containerId: space, title, treePosition, parentPageId,
      blocks: [{ id: randomUUID(), blockType: 'paragraph', treePosition: 'a', content: { text: [{ text: 'Retained handbook body' }] } }],
    });
    titles.set(body.value.pageId, title);
    return body.value.pageId;
  };
  const a = await create('Operations handbook', 'm1');
  const b = await create('Support handbook', 'm2');
  const c = await create('Release guide', 'm3');
  const incident = await create('Incident response', 'm1', a);
  const escalation = await create('Escalation contacts', 'm2', a);
  const checklist = await create('Incident checklist', 'm1', incident);
  const notes = await create('Customer notes', 'm1', b);
  const memberGrant = {
    targetKind: 'container', targetId: space, principalKind: 'member', principalId: 'browser-reader', level: 'edit',
  };
  const grant = await ok(owner, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), ...memberGrant });
  // The fixture owns identity only; every page, edge, position and permission above
  // was committed by the same HTTP doors used by the application.
  let roots = [home[0].id, a, b, c];
  const children = new Map([[a, [incident, escalation]], [incident, [checklist]], [b, [notes]]]);
  const expected = () => {
    const rows = [];
    const visit = (ids, parentPageId = null) => {
      for (const id of ids) { rows.push({ id, parentPageId }); visit(children.get(id) ?? [], id); }
    };
    visit(roots);
    return rows;
  };
  const inventory = async context => {
    const items = (await ok(context, origin, 'GET', `/api/pages?containerId=${space}`)).items;
    assert.equal(items.length, titles.size, 'The complete populated tree has no missing or duplicated pages.');
    const rows = [], seen = new Set();
    const visit = parentPageId => {
      const siblings = items.filter(item => (item.parentPageId ?? null) === parentPageId);
      siblings.sort((x, y) => x.treePosition < y.treePosition ? -1 : x.treePosition > y.treePosition ? 1 : x.id < y.id ? -1 : 1);
      assert.equal(new Set(siblings.map(item => item.treePosition)).size, siblings.length, 'Sibling positions are explicit and distinct.');
      for (const item of siblings) {
        assert.ok(typeof item.treePosition === 'string' && item.treePosition.length > 0, 'Every page has a stored position.');
        assert.ok(!seen.has(item.id), 'Every page occurs exactly once.');
        seen.add(item.id);
        rows.push({ id: item.id, parentPageId, treePosition: item.treePosition });
        visit(item.id);
      }
    };
    visit(null);
    assert.equal(seen.size, titles.size, 'Every parent edge reaches the container root.');
    assert.deepEqual(rows.map(({ id, parentPageId }) => ({ id, parentPageId })), expected(), 'The complete ordered hierarchy matches the independently specified moves.');
    return rows;
  };
  const tree = page => page.getByRole('navigation', { name: 'Pages', exact: true }).locator('.space-group')
    .filter({ has: page.getByRole('textbox', { name: 'Filter pages in Tree operations', exact: true }) });
  const row = (page, id) => tree(page).locator(`a[href="/app/pages/${id}"]`).locator('..');
  const reload = async page => {
    await page.goto(`${origin}/app/pages/${a}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await openNavigation(page);
    for (const { id } of expected()) {
      await expect(row(page, id)).toBeVisible();
      if (!(children.get(id)?.length)) continue;
      const expand = tree(page).getByRole('button', { name: `Expand ${titles.get(id)}`, exact: true });
      if (await expand.count()) { await expect(expand).toBeEnabled(); await expand.click(); }
    }
    const shown = await tree(page).locator('.tree-row > a').evaluateAll(links => links.map(link => ({
      id: link.getAttribute('href').split('/').at(-1),
      parentPageId: link.closest('li').parentElement.closest('li')?.querySelector(':scope > .tree-row > a')?.getAttribute('href').split('/').at(-1) ?? null,
    })));
    assert.deepEqual(shown, expected(), 'Reload renders the complete ordered parent and child inventory.');
  };
  const checkpoint = async (label, people) => {
    const stored = await inventory(owner);
    assert.deepEqual(await inventory(people.bob.context), stored, 'Both authorized members read byte-identical stored positions and edges.');
    await reload(people.bob.page);
    await reload(people.alice.page);
    evidence.snapshots.push({ label, rows: stored });
    return stored;
  };
  try {
    await withSecondPerson(state, width, async people => {
      const editor = people.bob;
      assert.equal((await ok(editor.context, origin, 'GET', '/api/session')).member.role, 'member');
      assert.equal((await ok(editor.context, origin, 'GET', `/api/pages/${a}`)).permissions.level, 'edit');
      await checkpoint('initial populated tree', people);
      const action = id => tree(editor.page).getByRole('button', { name: `Move ${titles.get(id)} in tree`, exact: true });
      await row(editor.page, c).hover();
      await row(editor.page, c).locator('a').focus();
      await editor.page.keyboard.press('Tab');
      await expect(action(c)).toBeFocused();
      await expect(action(c)).toHaveAttribute('data-tooltip', 'Move page');
      const tooltip = await action(c).evaluate(element => getComputedStyle(element, '::after').opacity);
      assert.equal(Number(tooltip), 1, 'The icon action tooltip is immediate on keyboard focus.');
      await accessible(editor.page, 'populated shared tree');

      const review = async id => {
        const pending = editor.page.waitForResponse(response => new URL(response.url()).pathname === `/api/pages/${id}/move-preview` && response.request().method() === 'POST');
        await editor.page.getByRole('dialog').getByRole('button', { name: 'Review access changes', exact: true }).click();
        const response = await pending;
        assert.equal(response.status(), 200, await response.text());
        const preview = await response.json(), placement = response.request().postDataJSON();
        assert.ok(preview.orderPreviewHash && preview.accessPreviewHash, 'The native preview binds both placement and current access.');
        assert.deepEqual(preview.changes, [], 'Same-container moves preserve both members’ authority.');
        await expect(editor.page.getByRole('dialog', { name: 'Review tree move', exact: true })).toContainText('No member access changes were found.');
        return { preview, placement };
      };
      const confirm = async (id, reviewed, status = 200) => {
        const matches = url => url.pathname === `/api/pages/${id}/move`;
        let captured;
        // Read the genuine Worker receipt before the native successful action
        // reloads the document and Chromium discards its response buffer.
        const capture = async route => {
          const response = await route.fetch({ maxRetries: 0 });
          captured = { status: response.status(), submitted: route.request().postDataJSON(), body: await response.json() };
          await route.fulfill({ response });
        };
        await editor.page.route(matches, capture);
        try {
          const pending = editor.page.waitForResponse(response => matches(new URL(response.url())) && response.request().method() === 'POST');
          await editor.page.getByRole('dialog').getByRole('button', { name: 'Confirm tree move', exact: true }).click();
          await pending;
        } finally { await editor.page.unroute(matches, capture); }
        const { submitted, body } = captured;
        assert.equal(captured.status, status, JSON.stringify(body));
        assert.equal(submitted.orderPreviewHash, reviewed.preview.orderPreviewHash);
        assert.equal(submitted.accessPreviewHash, reviewed.preview.accessPreviewHash);
        for (const [name, value] of Object.entries(reviewed.placement)) assert.deepEqual(submitted[name], value);
        if (status === 200) {
          assert.equal(body.receipt.operationKey, submitted.operationKey);
          assert.equal(body.receipt.entity.id, id);
          assert.ok(body.receipt.activityId);
          evidence.moves.push({ id, preview: reviewed.preview, submitted, receipt: body.receipt });
          await expect(editor.page.getByRole('dialog')).toHaveCount(0);
        } else evidence.refusals.push({ id, status, code: body.code });
        return { submitted, body };
      };
      const choose = async (id, parentPageId, position = '') => {
        await row(editor.page, id).hover();
        await action(id).click();
        const dialog = editor.page.getByRole('dialog', { name: 'Move in tree', exact: true });
        await dialog.getByRole('combobox', { name: 'Parent page', exact: true }).selectOption(parentPageId ?? '');
        await dialog.getByRole('combobox', { name: 'Position', exact: true }).selectOption(position);
      };
      if (width === 390) {
        // The registered phone smoke shows the same populated native move door;
        // the complete behavioural matrix runs once, in the desktop registration.
        await choose(c, b);
        await review(c);
        await accessible(editor.page, 'phone tree move review');
        await editor.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
        return;
      }
      const drag = async (id, target, edge) => {
        const source = row(editor.page, id), destination = row(editor.page, target);
        await source.scrollIntoViewIfNeeded();
        await destination.scrollIntoViewIfNeeded();
        const box = await destination.boundingBox();
        // Playwright's real pointer drag populates the browser's DataTransfer.
        await source.dragTo(destination, { targetPosition: { x: box.width / 2, y: edge === 'before' ? 2 : box.height / 2 } });
        await expect(editor.page.getByRole('dialog', { name: 'Move in tree', exact: true })).toBeVisible();
        return review(id);
      };
      let reviewed = await drag(c, a, 'before');
      assert.equal(reviewed.placement.beforeId, a);
      assert.equal(reviewed.placement.parentPageId, null);
      await confirm(c, reviewed);
      roots = [home[0].id, c, a, b];
      await checkpoint('drag sibling reorder', people);

      reviewed = await drag(escalation, b, 'inside');
      assert.equal(reviewed.placement.parentPageId, b);
      assert.equal(reviewed.placement.atEnd, true);
      await confirm(escalation, reviewed);
      children.set(a, [incident]); children.set(b, [notes, escalation]);
      await checkpoint('drag reparent', people);

      await choose(c, null, `after:${a}`);
      reviewed = await review(c);
      await confirm(c, reviewed);
      roots = [home[0].id, a, c, b];
      await checkpoint('native action sibling reorder', people);

      await choose(incident, b, `before:${notes}`);
      reviewed = await review(incident);
      await accessible(editor.page, 'desktop tree move review');
      const retainedMove = await confirm(incident, reviewed);
      children.set(a, []); children.set(b, [incident, notes, escalation]);
      const stable = await checkpoint('native action moves a populated subtree', people);
      assert.equal(stable.find(item => item.id === checklist).parentPageId, incident);
      const replay = await ok(editor.context, origin, 'POST', `/api/pages/${incident}/move`, retainedMove.submitted);
      assert.deepEqual(replay.receipt, retainedMove.body.receipt);
      assert.deepEqual(await inventory(owner), stable, 'Replaying a successful move cannot move it again.');

      // Preview a reorder, then change its destination cohort through a second
      // authorized member before confirmation. The stale action must change nothing.
      await choose(c, null, `before:${a}`);
      reviewed = await review(c);
      const competingPlacement = { containerId: space, parentPageId: null, beforeId: c };
      const competingPreview = await ok(owner, origin, 'POST', `/api/pages/${b}/move-preview`, competingPlacement);
      const current = await ok(owner, origin, 'GET', `/api/pages/${b}`);
      await ok(owner, origin, 'POST', `/api/pages/${b}/move`, {
        operationKey: randomUUID(), expectedRevisionId: current.page.revisionId, ...competingPlacement,
        accessPreviewHash: competingPreview.accessPreviewHash, orderPreviewHash: competingPreview.orderPreviewHash,
      });
      roots = [home[0].id, a, b, c];
      const afterCompeting = await inventory(owner);
      const refused = await confirm(c, reviewed, 409);
      assert.equal(refused.body.code, 'ORDER_PREVIEW_CHANGED');
      await expect(editor.page.getByRole('alert')).toContainText('Review the current placement');
      assert.deepEqual(await inventory(owner), afterCompeting, 'A stale preview changes no edge or position.');
      await editor.page.getByRole('dialog').getByRole('button', { name: 'Choose another position', exact: true }).click();
      reviewed = await review(c);
      await confirm(c, reviewed);
      roots = [home[0].id, c, a, b];
      await checkpoint('fresh review after stale placement', people);

      await choose(b, checklist);
      const cycleResponse = editor.page.waitForResponse(response => new URL(response.url()).pathname === `/api/pages/${b}/move-preview`);
      const beforeCycle = await inventory(owner);
      await editor.page.getByRole('dialog').getByRole('button', { name: 'Review access changes', exact: true }).click();
      const cycle = await cycleResponse;
      assert.equal(cycle.status(), 400);
      assert.equal((await cycle.json()).code, 'TREE_CYCLE');
      await expect(editor.page.getByRole('alert')).toContainText('own descendant');
      assert.deepEqual(await inventory(owner), beforeCycle, 'A cycle preview changes no edge or position.');
      evidence.refusals.push({ status: 400, code: 'TREE_CYCLE' });
      await editor.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();

      const beforeEdits = await inventory(owner);
      await editor.page.goto(`${origin}/app/pages/${c}`, { waitUntil: 'networkidle' });
      const bodySaved = editor.page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname.includes(`/api/pages/${c}/blocks/`));
      await editor.page.getByRole('textbox', { name: 'Paragraph', exact: true }).fill('Updated release procedure');
      assert.equal((await bodySaved).status(), 200);
      await expect(editor.page.locator('.editor-save-status')).toHaveText('Saved');
      assert.deepEqual(await inventory(owner), beforeEdits, 'Body edits preserve every stored position and edge.');
      const titleSaved = editor.page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/pages/${c}`);
      await editor.page.getByRole('textbox', { name: 'Page title', exact: true }).fill('A renamed release guide');
      await editor.page.getByRole('textbox', { name: 'Page title', exact: true }).press('Tab');
      assert.equal((await titleSaved).status(), 200);
      titles.set(c, 'A renamed release guide');
      assert.deepEqual(await inventory(owner), beforeEdits, 'A rename cannot alphabetically reorder the tree.');
      const publishDoc = await ok(editor.context, origin, 'GET', `/api/pages/${c}`);
      const published = await ok(editor.context, origin, 'POST', `/api/pages/${c}/publish`, { operationKey: randomUUID(), expectedRevisionId: publishDoc.page.revisionId });
      assert.ok(published.receipt.activityId);
      assert.deepEqual(await inventory(owner), beforeEdits, 'Publishing preserves every stored position and edge.');
      const durable = await ok(owner, origin, 'GET', `/api/pages/${c}`);
      assert.equal(durable.page.title, 'A renamed release guide');
      assert.equal(durable.blocks[0].content.text[0].text, 'Updated release procedure');
      await checkpoint('body edit rename and publish preserve order', people);

      // Downgrade the same real editor to a viewer. Both a new move and a
      // previously successful operation replay must obey current authority.
      await ok(owner, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), ...memberGrant, id: grant.value.id, level: 'view' });
      await reload(editor.page);
      await row(editor.page, c).hover();
      await expect(action(c)).toBeDisabled();
      await expect(row(editor.page, c)).toHaveAttribute('draggable', 'false');
      const beforeViewer = await inventory(owner);
      for (const [route, input] of [
        [`/api/pages/${incident}/move-preview`, { containerId: space, parentPageId: null, atEnd: true }],
        [`/api/pages/${incident}/move`, { ...retainedMove.submitted, operationKey: randomUUID() }],
        [`/api/pages/${incident}/move`, retainedMove.submitted],
      ]) {
        const result = await call(editor.context, origin, 'POST', route, input);
        assert.equal(result.status, 404, JSON.stringify(result.body));
        evidence.refusals.push({ route, status: result.status, code: result.body.code });
        assert.deepEqual(await inventory(owner), beforeViewer, 'A viewer move or replay changes no topology or order.');
      }
      await checkpoint('viewer refusal preserves the complete tree', people);
      await accessible(editor.page, 'viewer tree move unavailable');
    });
  } finally {
    await writeFile(path.join(directory, 'receipts.json'), JSON.stringify(evidence, null, 2));
  }
}
