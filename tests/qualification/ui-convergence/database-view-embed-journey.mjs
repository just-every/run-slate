import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible } from './browser-evidence.mjs';
import { call, grant, ok, withSecondPerson } from './two-people-support.mjs';

/** Populated native embedding, independent criteria and two readers through the emitted Worker. */
export async function databaseViewEmbedJourney(state, width) {
  await withSecondPerson(state, width, async ({ alice, bob }) => {
    const { origin } = state;
    const output = path.join(root, '.artifacts/ui-convergence/database-view', String(width));
    await mkdir(output, { recursive: true });
    const receipts = [];
    const mutate = async (method, route, data, context = alice.context) => {
      const response = await ok(context, origin, method, route, { operationKey: randomUUID(), ...data });
      receipts.push({ method, route, response });
      return response;
    };
    const read = route => ok(alice.context, origin, 'GET', route);
    const spaceId = (await mutate('POST', '/api/containers', { name: 'Embedded database sources', visibility: 'default' })).value.id;
    const databaseId = (await mutate('POST', '/api/databases', { containerId: spaceId, title: 'Release inventory' })).value.id;
    let source = await read(`/api/databases/${databaseId}`);
    const fieldId = randomUUID();
    await mutate('POST', `/api/databases/${databaseId}/fields`, { expectedRevisionId: source.database.revision_id, field: { id: fieldId, name: 'Priority', type: 'number', config: {}, position: 0 } });
    source = await read(`/api/databases/${databaseId}`);
    const viewId = randomUUID();
    const viewName = 'Release work';
    await mutate('POST', `/api/databases/${databaseId}/views`, { expectedRevisionId: source.database.revision_id, view: { id: viewId, name: viewName, layout: 'table', filters: [], sorts: [{ field: '$title', direction: 'asc' }], groups: [], calculations: {}, display: {}, position: 0 } });
    source = await read(`/api/databases/${databaseId}`);
    await grant(alice.context, origin, source.database.page_id, 'browser-owner', 'full');
    await grant(alice.context, origin, source.database.page_id, bob.id, 'view');
    await mutate('PUT', `/api/sharing/pages/${source.database.page_id}/inheritance`, { expectedRevisionId: (await read(`/api/pages/${source.database.page_id}`)).page.revisionId, restricted: true });
    const records = [];
    for (const [title, priority, readable] of [['Alpha release', 1, true], ['Bravo confidential', 2, false], ['Delta release', 4, true], ['Zulu confidential', 3, false]]) {
      const pageId = (await mutate('POST', `/api/databases/${databaseId}/records`, { title, values: { [fieldId]: priority } })).value.pageId;
      await grant(alice.context, origin, pageId, 'browser-owner', 'full');
      await mutate('PUT', `/api/sharing/pages/${pageId}/inheritance`, { expectedRevisionId: (await read(`/api/pages/${pageId}`)).page.revisionId, restricted: true });
      if (readable) await grant(alice.context, origin, pageId, bob.id, 'view');
      records.push({ pageId, title, priority });
    }
    const textId = randomUUID();
    const target = (await mutate('POST', '/api/pages', { containerId: spaceId, title: 'Live release report', blocks: [{ id: textId, blockType: 'paragraph', treePosition: 'a', content: { text: [{ text: 'Report notes' }] } }] })).value.pageId;
    await grant(alice.context, origin, target, 'browser-owner', 'full');
    const editGrant = await grant(alice.context, origin, target, bob.id, 'edit');
    await mutate('PUT', `/api/sharing/pages/${target}/inheritance`, { expectedRevisionId: (await read(`/api/pages/${target}`)).page.revisionId, restricted: true });
    const endpoint = `/api/databases/${databaseId}/views/${viewId}/query`;
    const region = page => page.getByRole('region', { name: 'Database view', exact: true });
    const visibleIds = page => region(page).locator('tbody tr').evaluateAll(rows => rows.map(row => row.dataset.recordId));
    const expectIds = async (page, ids, timeout = 10000) => {
      await expect.poll(() => visibleIds(page), { timeout }).toEqual(ids);
      await expect(region(page).locator('[data-record-count]')).toHaveText(`${ids.length} readable ${ids.length === 1 ? 'record' : 'records'}`);
    };
    await bob.page.goto(`${origin}/app/pages/${target}`, { waitUntil: 'networkidle' });
    // Morgan is a non-owner editor and inserts from the ordinary block picker.
    await bob.page.getByRole('button', { name: /Add block/ }).click();
    await bob.page.getByPlaceholder('Type to search').fill('Database view');
    await bob.page.getByRole('option', { name: 'Database view', exact: true }).click();
    await region(bob.page).getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = bob.page.getByRole('dialog', { name: 'Database view settings' });
    await settings.getByLabel('Database', { exact: true }).selectOption(databaseId);
    await settings.getByLabel('Saved view', { exact: true }).selectOption(viewId);
    await settings.getByRole('button', { name: 'Save embedded view', exact: true }).click();
    await expectIds(bob.page, [records[0].pageId, records[2].pageId]);
    await alice.page.goto(`${origin}/app/pages/${target}`, { waitUntil: 'networkidle' });
    await expectIds(alice.page, records.map(record => record.pageId));
    const sourceBefore = await read(`/api/databases/${databaseId}`);
    const ownerBefore = await read(`/api/databases/${databaseId}/views/${viewId}`);
    // Controls save block-owned criteria; no source-view mutation is sent.
    await region(bob.page).getByRole('button', { name: 'Settings', exact: true }).click();
    await settings.getByRole('button', { name: 'Add condition', exact: true }).click();
    await settings.getByLabel('Field', { exact: true }).selectOption(fieldId);
    await settings.getByLabel('Condition', { exact: true }).selectOption('gt');
    await settings.getByLabel('Value', { exact: true }).fill('1');
    await settings.getByRole('button', { name: 'Add block sort', exact: true }).click();
    await settings.getByLabel('Sort field 1', { exact: true }).selectOption(fieldId);
    await settings.getByLabel('Sort direction 1', { exact: true }).selectOption('desc');
    await settings.getByRole('button', { name: 'Add block sort', exact: true }).click();
    await settings.getByLabel('Sort direction 2', { exact: true }).selectOption('desc');
    const close = settings.getByRole('button', { name: 'Close dialog', exact: true });
    await close.focus();
    await bob.page.keyboard.press('Tab');
    await bob.page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();
    await expect.poll(() => close.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
    await accessible(bob.page, 'database view settings');
    await settings.getByRole('button', { name: 'Save embedded view', exact: true }).click();
    await expectIds(bob.page, [records[2].pageId]);
    await expect(bob.page.locator('.editor-save-status')).toHaveText('Saved');
    await bob.page.reload({ waitUntil: 'networkidle' });
    await expectIds(bob.page, [records[2].pageId]);
    const stored = (await read(`/api/pages/${target}`)).blocks.find(block => block.blockType === 'database-view');
    assert.deepEqual(stored.content.definition, { databaseId, viewId, filters: [{ field: fieldId, op: 'gt', value: 1 }], sorts: [{ field: fieldId, direction: 'desc' }, { field: '$title', direction: 'desc' }] });
    await region(bob.page).getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(settings.getByLabel('Field', { exact: true })).toHaveValue(fieldId);
    await expect(settings.getByLabel('Value', { exact: true })).toHaveValue('1');
    await expect(settings.getByLabel('Sort field 1', { exact: true })).toHaveValue(fieldId);
    await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(await read(`/api/databases/${databaseId}`), sourceBefore, 'Embedding leaves every source-view row unchanged.');
    assert.deepEqual(await read(`/api/databases/${databaseId}/views/${viewId}`), ownerBefore, 'Another reader of the source view keeps exactly the same results and counts.');
    await alice.page.reload({ waitUntil: 'networkidle' });
    await expectIds(alice.page, [records[2].pageId, records[3].pageId, records[1].pageId]);
    await accessible(bob.page, 'database view current member records');
    await accessible(alice.page, 'database view current owner records');

    let timing;
    if (width === 1440) {
      const textPath = `/api/pages/${target}/blocks/${textId}`;
      let held;
      const hold = route => route.request().method() === 'PATCH' ? (held = route) : route.continue();
      await bob.page.route(url => url.pathname === textPath, hold);
      try {
        const editor = bob.page.locator(`[data-block-id="${textId}"] [contenteditable="true"]`);
        await editor.fill('Unsaved release notes remain here');
        await expect.poll(() => !!held).toBe(true);
        const changed = await mutate('PATCH', `/api/databases/${databaseId}/records/${records[0].pageId}`, { expectedRevisionId: (await read(`/api/pages/${records[0].pageId}`)).page.revisionId, values: { [fieldId]: 5 } });
        const since = Date.parse(changed.receipt.committedAt);
        await expectIds(bob.page, [records[0].pageId, records[2].pageId], 5000);
        timing = Date.now() - since;
        assert.ok(timing >= 0 && timing <= 5000, `Cross-session source commit visible within five seconds: ${timing} ms`);
        await expect(editor).toHaveText('Unsaved release notes remain here');
        assert.equal((await read(`/api/pages/${target}`)).blocks.find(block => block.id === textId).content.text[0].text, 'Report notes');
        const response = await held.fetch();
        assert.equal(response.status(), 200);
        await held.fulfill({ response });
        held = undefined;
      } finally {
        await held?.abort().catch(() => {});
        await bob.page.unroute(url => url.pathname === textPath, hold);
      }
      await expect(bob.page.locator('.editor-save-status')).toHaveText('Saved');
    }
    const exportResponse = await bob.context.request.post(`${origin}/api/exports/readable`, { data: { scope: 'page', id: target, format: 'html' }, headers: { origin } });
    assert.equal(exportResponse.status(), 200);
    const files = unzipSync(new Uint8Array(await exportResponse.body()));
    const exportedHtml = strFromU8(files[`pages/${target}.html`]);
    assert.ok(exportedHtml.includes(`Database view: Release inventory — ${viewName}`));
    for (const record of records) assert.ok(!exportedHtml.includes(record.title));
    await writeFile(path.join(output, 'readable.html'), exportedHtml);
    const snapshot = await bob.context.newPage();
    try { await snapshot.setContent(exportedHtml); await snapshot.screenshot({ path: path.join(output, 'readable.png'), fullPage: true }); }
    finally { await snapshot.close(); }
    await mutate('POST', `/api/publishing/${target}`, { expectedRevisionId: (await read(`/api/pages/${target}`)).page.revisionId, host: new URL(origin).host, slug: 'live-database-view' });
    const anonymous = await alice.context.browser().newContext({ viewport: bob.page.viewportSize() });
    try {
      const requests = [];
      anonymous.on('request', request => requests.push(new URL(request.url()).pathname));
      const page = await anonymous.newPage();
      await page.goto(`${origin}/p/live-database-view`, { waitUntil: 'networkidle' });
      await expect(page.getByText('Sign in to view this database view.', { exact: true })).toBeVisible();
      for (const hidden of [...records.map(record => record.title), viewName, 'Release inventory']) await expect(page.locator('body')).not.toContainText(hidden);
      assert.deepEqual(requests.filter(route => route.startsWith('/api/')), []);
      await accessible(page, 'anonymous database view sign-in notice');
    } finally { await anonymous.close(); }
    // Downgrade Morgan: a viewer cannot edit the stored block.
    await mutate('POST', '/api/sharing', { id: editGrant.value.id, targetKind: 'page', targetId: target, principalKind: 'member', principalId: bob.id, level: 'view' });
    await bob.page.reload({ waitUntil: 'networkidle' });
    await expect(region(bob.page).getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
    const beforeDenied = await read(`/api/pages/${target}`);
    const denied = await call(bob.context, origin, 'PATCH', `/api/pages/${target}/blocks/${stored.id}`, { operationKey: randomUUID(), expectedRevisionId: stored.revisionId, content: { definition: { ...stored.content.definition, filters: [] } } });
    assert.equal(denied.status, 404);
    assert.deepEqual((await read(`/api/pages/${target}`)).blocks, beforeDenied.blocks);
    // Remove a record grant while the report remains open: no stale row or count survives.
    const recordGrant = (await read(`/api/sharing/pages/${records[2].pageId}`)).items.find(item => item.principalId === bob.id);
    await mutate('POST', '/api/sharing', { id: recordGrant.id, targetKind: 'page', targetId: records[2].pageId, principalKind: 'member', principalId: bob.id, level: 'view', revoke: true });
    await expectIds(bob.page, width === 1440 ? [records[0].pageId] : []);
    const sourceGrant = (await read(`/api/sharing/pages/${source.database.page_id}`)).items.find(item => item.principalId === bob.id);
    await mutate('POST', '/api/sharing', { id: sourceGrant.id, targetKind: 'page', targetId: source.database.page_id, principalKind: 'member', principalId: bob.id, level: 'view', revoke: true });
    await expect(region(bob.page).getByText('The database view is unavailable.', { exact: true })).toBeVisible();
    await expect(region(bob.page).locator('tbody tr')).toHaveCount(0);
    await expect(region(bob.page).locator('[data-record-count]')).toHaveCount(0);
    await expect(region(bob.page)).not.toContainText(viewName);
    await accessible(bob.page, 'database view lost source access');
    await grant(alice.context, origin, source.database.page_id, bob.id, 'view');
    await expectIds(bob.page, width === 1440 ? [records[0].pageId] : []);
    const latest = await read(`/api/databases/${databaseId}`);
    await mutate('POST', `/api/databases/${databaseId}/views`, { expectedRevisionId: latest.database.revision_id, view: latest.views[0], delete: true });
    await expect(region(bob.page).getByText('The database view is unavailable.', { exact: true })).toBeVisible();
    await expect(region(bob.page).locator('tbody tr')).toHaveCount(0);
    await expect(region(alice.page).getByText('The database view is unavailable.', { exact: true })).toBeVisible();
    await writeFile(path.join(output, 'receipt.json'), JSON.stringify({ width, databaseId, pageId: target, sourceBefore: sourceBefore.views, storedDefinition: stored.content.definition, expectedOwner: records.map(record => record.pageId), expectedMember: [records[0].pageId, records[2].pageId], sourceChangeVisibleMs: timing, receipts }, null, 2));
  });
}
