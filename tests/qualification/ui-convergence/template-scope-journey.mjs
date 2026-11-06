import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';
import { call, ok, withSecondPerson } from './two-people-support.mjs';

/** Readable collections distinguish scope filtering from a permission refusal. */
export async function templateScopeJourney(state) {
  const { page, context, origin, api } = state;
  const width = page.viewportSize().width;
  return withSecondPerson(state, width, async ({ bob }) => {
    const receipts = [], readbacks = [];
    const post = (route, data) => ok(context, origin, 'POST', route, { operationKey: randomUUID(), ...data });
    const baseline = (await api('/api/templates')).items;
    assert.ok(baseline.length > 0, 'The workspace collection is populated.');
    assert.ok(baseline.every(item => item.containerId === null));
    const spaces = [];
    for (const name of ['Atlas templates', 'Beacon templates']) {
      const space = (await post('/api/containers', { name, visibility: 'private' })).value;
      assert.equal((await api(`/api/containers/${space.id}`)).name, name);
      spaces.push({ ...space, name });
    }
    const source = (await post('/api/pages', {
      containerId: spaces[0].id, title: 'Scope source',
      blocks: [{ id: randomUUID(), blockType: 'paragraph', content: { text: [{ text: 'Retained scope snapshot' }] }, treePosition: 'a0' }],
    })).value;
    const definitions = [
      { title: 'A workspace movable', containerId: null },
      { title: 'B workspace retained', containerId: null },
      { title: 'Y Atlas first', containerId: spaces[0].id },
      { title: 'Z Atlas second', containerId: spaces[0].id },
      { title: 'Y Beacon first', containerId: spaces[1].id },
      { title: 'Z Beacon second', containerId: spaces[1].id },
    ];
    for (const item of definitions) {
      const saved = (await post('/api/templates', {
        sourcePageId: source.pageId, includeChildren: false,
        description: `Reusable ${item.title}`, category: 'Scope proof', ...item,
      })).value;
      item.id = saved.id;
      // Even the template deliberately excluded from another collection is readable.
      assert.equal((await api(`/api/templates/${item.id}`)).title, item.title);
    }
    const movable = definitions[0];
    const original = await api(`/api/templates/${movable.id}`);
    assert.match(JSON.stringify(original.snapshot), /Retained scope snapshot/);
    const address = `${origin}/app/templates/${movable.id}`;
    let revisionId = original.revisionId;
    async function retainedAddress(label, archived = false) {
      const stored = await api(`/api/templates/${movable.id}`);
      assert.equal(stored.id, original.id);
      assert.equal(stored.revisionId, revisionId);
      assert.equal(stored.title, movable.title);
      const collection = (await api(`/api/templates?state=${archived ? 'archived' : 'active'}&containerId=${movable.containerId ?? ''}`)).items;
      assert.equal(collection.find(item => item.id === movable.id)?.containerId, movable.containerId);
      assert.equal(Boolean(stored.archivedAt), archived);
      assert.deepEqual(stored.snapshot, original.snapshot);
      for (const open of [() => page.goto(address, { waitUntil: 'networkidle' }), () => page.reload({ waitUntil: 'networkidle' })]) {
        assert.equal((await open()).status(), 200);
        assert.equal(page.url(), address, `${label}: the retained address never redirects to another record.`);
        const preview = page.locator('.template-preview');
        await expect(preview.getByRole('heading', { name: movable.title, exact: true, level: 2 })).toBeVisible();
        await expect(preview).toContainText('Retained scope snapshot');
      }
      readbacks.push({ label, path: new URL(address).pathname, id: stored.id, title: stored.title,
        revisionId: stored.revisionId, containerId: movable.containerId, archived, snapshot: stored.snapshot });
    }
    async function readerAddress(label, allowed) {
      const route = `/api/templates/${movable.id}`;
      const read = await call(bob.context, origin, 'GET', route);
      let refusedReplay;
      assert.equal(read.status, allowed ? 200 : 404);
      if (allowed) {
        assert.equal(read.body.id, original.id);
        assert.equal(read.body.title, movable.title);
        assert.deepEqual(read.body.snapshot, original.snapshot);
      } else {
        assert.equal(read.body.title, undefined);
        assert.equal(read.body.snapshot, undefined);
        assert.ok(!JSON.stringify(read.body).includes(movable.title));
        const captured = receipts.at(-1);
        const before = await api(route);
        const activity = await api('/api/activity?action=templates.move&limit=100');
        refusedReplay = await call(bob.context, origin, 'POST', captured.route, captured.request);
        assert.equal(refusedReplay.status, 404, 'A captured move cannot bypass current private-space authority.');
        assert.deepEqual(await api(route), before, 'The refused capture leaves the complete template unchanged.');
        assert.deepEqual(await api('/api/activity?action=templates.move&limit=100'), activity, 'The refused capture creates no move activity.');
      }
      for (const open of [() => bob.page.goto(address, { waitUntil: 'networkidle' }), () => bob.page.reload({ waitUntil: 'networkidle' })]) {
        await open();
        assert.equal(bob.page.url(), address);
        const preview = bob.page.locator('.template-preview');
        if (allowed) {
          await expect(preview.getByRole('heading', { name: movable.title, exact: true, level: 2 })).toBeVisible();
          await expect(preview).toContainText('Retained scope snapshot');
        } else {
          await expect(preview.getByRole('heading', { name: 'Content unavailable', exact: true })).toBeVisible();
          await expect(bob.page.locator('body')).not.toContainText(movable.title);
          await expect(bob.page.locator('body')).not.toContainText('Retained scope snapshot');
        }
      }
      readbacks.push({ label, readerStatus: read.status, refusedReplayStatus: refusedReplay?.status, path: new URL(address).pathname });
    }
    async function mutation(route, submit) {
      const pending = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === route);
      await submit();
      const response = await pending;
      assert.equal(response.status(), route === '/api/templates' ? 201 : 200, await response.text());
      const receipt = await response.json();
      const submitted = response.request().postDataJSON();
      assert.equal(receipt.value.id, original.id);
      assert.notEqual(receipt.value.revisionId, revisionId);
      assert.ok(receipt.receipt.operationKey);
      assert.equal(receipt.receipt.operationKey, submitted.operationKey);
      assert.equal(receipt.receipt.revisionId, receipt.value.revisionId);
      assert.deepEqual(receipt.receipt.entity, { kind: 'template', id: original.id, revisionId: receipt.value.revisionId });
      assert.ok(receipt.receipt.activityId);
      const committed = await api(`/api/templates/${movable.id}`);
      const replay = await ok(context, origin, 'POST', route, submitted);
      assert.deepEqual(replay, receipt, 'The same native request returns the committed receipt.');
      assert.deepEqual(await api(`/api/templates/${movable.id}`), committed, 'Retrying cannot change the template or issue another revision.');
      const action = route === '/api/templates' ? 'templates.save' : `templates.${submitted.action}`;
      const activity = (await api(`/api/activity?action=${action}&limit=100`)).items.filter(item => item.operationKey === submitted.operationKey);
      assert.equal(activity.length, 1, 'Each committed template mutation has one activity entry after replay.');
      assert.equal(activity[0].id, receipt.receipt.activityId);
      assert.deepEqual(activity[0].target, { kind: 'template', id: original.id });
      revisionId = receipt.value.revisionId;
      receipts.push({ route, status: response.status(), request: submitted, ...receipt, activity: activity[0] });
      return receipt;
    }
    const alphabetic = items => [...items].sort((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : a.id.localeCompare(b.id));
    const expected = containerId => [
      ...alphabetic(definitions.filter(item => containerId && item.containerId === containerId)),
      ...alphabetic([...baseline, ...definitions.filter(item => item.containerId === null)]),
    ];
    const choice = title => page.locator('.template-choice').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    async function collection(containerId, label) {
      const wanted = expected(containerId);
      const actual = (await api(`/api/templates${containerId ? `?containerId=${containerId}` : ''}`)).items;
      assert.deepEqual(actual.map(item => [item.id, item.title, item.containerId]), wanted.map(item => [item.id, item.title, item.containerId]), `${label}: exact native order and scope`);
      await page.goto(origin + (containerId ? `/app/containers/${containerId}` : '/app/templates'), { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      if (containerId) {
        await page.getByRole('navigation', { name: 'Space navigation', exact: true }).getByRole('button', { name: 'Templates', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Filter templates', exact: true }).click();
      await expect(page.getByRole('combobox', { name: 'Collection', exact: true })).toHaveValue(containerId ?? '');
      await page.keyboard.press('Escape');
      await expect(page.locator('.template-choice h3')).toHaveText(wanted.map(item => item.title));
      for (const item of definitions.filter(item => item.containerId && item.containerId !== containerId)) {
        await expect(choice(item.title)).toHaveCount(0);
      }
      return actual;
    }
    async function reconcile(label, capture = false) {
      for (const space of spaces) {
        const items = await collection(space.id, `${label} ${space.name}`);
        if (capture) {
          await accessible(page, `template scope ${space.name}`);
          await page.screenshot({ path: `.artifacts/ui-convergence/template-scope-${width}-${space.id}.png`, fullPage: true });
        }
        assert.ok(items.some(item => item.containerId === space.id), 'A populated local collection precedes workspace choices.');
      }
      await collection(null, `${label} workspace`);
      if (capture) await page.screenshot({ path: `.artifacts/ui-convergence/template-scope-${width}-workspace.png`, fullPage: true });
    }
    await reconcile('Initial', true);
    await retainedAddress('Created');
    await readerAddress('Workspace reader before changes', true);
    await page.getByRole('button', { name: 'Update from a page', exact: true }).click();
    const update = page.getByRole('dialog', { name: 'Update this template', exact: true });
    await update.locator('select[name="sourcePageId"]').selectOption(source.pageId);
    await update.locator('input[name="title"]').fill('A renamed workspace movable');
    await mutation('/api/templates', () => update.getByRole('button', { name: 'Save updated template', exact: true }).click());
    await expect(update).toBeHidden();
    movable.title = 'A renamed workspace movable';
    await retainedAddress('Renamed through Update from a page');
    await readerAddress('Renamed workspace address', true);
    await reconcile('Renamed');
    console.log('PROBE TMPL-006 scope: two readable container Templates tabs and workspace collection -> exact ordered lists, own scope first and other scope absent after reload');
    const requests = [];
    const record = request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/templates/${movable.id}/change`) requests.push(request.postDataJSON());
    };
    page.on('request', record);
    try {
      for (const containerId of [spaces[0].id, null]) {
        await collection(movable.containerId, 'Move source');
        await choice(movable.title).click();
        const before = await api(`/api/templates/${movable.id}`);
        await page.getByRole('button', { name: 'Move collection', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Move template', exact: true });
        await dialog.getByRole('combobox', { name: 'Collection', exact: true }).selectOption(containerId ?? '');
        await page.screenshot({ path: `.artifacts/ui-convergence/template-scope-${width}-move-${containerId ? 'container' : 'workspace'}.png`, fullPage: true });
        const receipt = await mutation(`/api/templates/${movable.id}/change`, () => dialog.getByRole('button', { name: 'Move', exact: true }).click());
        assert.equal(receipt.value.id, movable.id);
        assert.notEqual(receipt.value.revisionId, before.revisionId);
        await expect(dialog).toBeHidden();
        movable.containerId = containerId;
        await reconcile(containerId ? 'Moved into Atlas' : 'Returned to workspace');
        const after = await api(`/api/templates/${movable.id}`);
        assert.equal(after.id, original.id);
        assert.equal(after.revisionId, receipt.value.revisionId);
        assert.deepEqual(after.snapshot, original.snapshot, 'Scope moves retain the complete snapshot.');
        assert.deepEqual([after.title, after.description, after.category], [movable.title, original.description, original.category]);
        await retainedAddress(containerId ? 'Moved into private Atlas' : 'Returned to workspace');
        await readerAddress(containerId ? 'Current reader refused after move' : 'Current reader restored after move', !containerId);
        console.log(`PROBE TMPL-006 move ${containerId ? 'into container' : 'back to workspace'}: one native Move collection submission -> receipt ${receipt.value.id}, unchanged snapshot and all three collections reconciled after reload`);
      }
      assert.deepEqual(requests.map(item => [item.action, item.containerId]), [['move', spaces[0].id], ['move', null]], 'Each scope change is exactly one native mutation.');
      assert.equal(new Set(requests.map(item => item.operationKey)).size, 2);
    } finally {
      page.off('request', record);
    }
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    const archive = page.getByRole('dialog', { name: 'Archive template', exact: true });
    await mutation(`/api/templates/${movable.id}/change`, () => archive.getByRole('button', { name: 'Archive', exact: true }).click());
    await expect(archive).toBeHidden();
    definitions.splice(definitions.indexOf(movable), 1);
    await reconcile('Archived');
    await retainedAddress('Archived', true);
    await readerAddress('Archived workspace address', true);
    await page.goto(origin + '/app/templates', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Filter templates', exact: true }).click();
    await page.getByRole('combobox', { name: /^Show/ }).selectOption('archived');
    await page.keyboard.press('Escape');
    const archived = (await api('/api/templates?state=archived')).items;
    assert.deepEqual(archived.map(item => [item.id, item.title, item.containerId]), [[movable.id, movable.title, null]]);
    await expect(page.locator('.template-choice h3')).toHaveText([movable.title]);
    await choice(movable.title).click();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    const restore = page.getByRole('dialog', { name: 'Restore template', exact: true });
    await mutation(`/api/templates/${movable.id}/change`, () => restore.getByRole('button', { name: 'Restore', exact: true }).click());
    await expect(restore).toBeHidden();
    await expect(page.locator('.template-choice')).toHaveCount(0);
    assert.deepEqual((await api('/api/templates?state=archived')).items, []);
    definitions.push(movable);
    await reconcile('Restored');
    await retainedAddress('Restored through archived gallery');
    await readerAddress('Restored workspace address', true);
    await accessible(page, 'retained authored template address');
    await page.screenshot({ path: `.artifacts/ui-convergence/template-address-${width}.png`, fullPage: true });
    await writeFile(`.artifacts/ui-convergence/template-address-${width}.json`, JSON.stringify({ width, address: new URL(address).pathname, receipts, readbacks }, null, 2));
    console.log(`PROBE LINK-001 1: Update from a page, move into a private space and back, archive and archived-gallery restore -> ${new URL(address).pathname} reopened and reloaded after every commit, exact populated inventories and snapshot retained`);
    console.log('PROBE LINK-001 2: same template address for owner and current reader -> workspace reads succeed, private-space reads refuse 404 without title or snapshot, returned workspace reads succeed');
  });
}
