import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

/** Identity comes from the shared harness; all database setup and assertions use real public routes. */
export async function databaseJourney({ page, origin, context, api }) {
  async function mutate(route, data, method = 'POST') {
    const response = await context.request.fetch(origin + route, {
      method, data: { operationKey: randomUUID(), ...data },
    });
    assert.ok(response.ok(), await response.text());
    return (await response.json()).value;
  }
  const container = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  assert.ok(container);
  const database = await mutate('/api/databases', { containerId: container.id, title: 'Field operations' });
  const base = `/api/databases/${database.id}`;
  const keep = { id: randomUUID(), name: 'Notes', type: 'text', config: {}, position: 0 };
  const remove = { id: randomUUID(), name: 'Retired field', type: 'text', config: {}, position: 1 };
  const hidden = { id: randomUUID(), name: 'Hidden details', type: 'text', config: {}, position: 2 };
  let revision = database.revisionId;
  for (const field of [keep, remove, hidden]) {
    revision = (await mutate(base + '/fields', { expectedRevisionId: revision, field })).revisionId;
  }
  const view = {
    id: randomUUID(), name: 'Operations', layout: 'table', filters: [], sorts: [], groups: [],
    calculations: {}, display: { visibleFieldIds: [keep.id, remove.id] }, position: 0,
  };
  await mutate(base + '/views', { expectedRevisionId: revision, view });
  const title = 'Selected, "quoted" record';
  const record = await mutate(base + '/records', {
    title, values: { [keep.id]: 'Before export', [remove.id]: 'Retained', [hidden.id]: 'Do not export hidden details' },
  });
  await mutate(base + '/records', { title: 'Other record', values: { [keep.id]: 'Outside the search' } });
  await page.goto(`${origin}/app/databases/${database.id}`, { waitUntil: 'networkidle' });

  async function openRemoval() {
    await page.getByRole('button', { name: 'Fields', exact: true }).click();
    await page.getByRole('menuitem', { name: remove.name, exact: true }).click();
    await page.getByRole('dialog', { name: 'Field settings', exact: true })
      .getByRole('button', { name: 'Remove field', exact: true }).click();
    return page.getByRole('dialog', { name: 'Remove this field?', exact: true });
  }
  let dialog = await openRemoval();
  // Impact must be visible before a destructive request; Cancel leaves the field intact.
  await expect(dialog).toContainText(remove.name);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.ok((await api(base)).fields.some(field => field.id === remove.id));

  dialog = await openRemoval();
  await dialog.getByRole('button', { name: 'Remove field', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  assert.ok((await api(base)).fields.some(field => field.id === remove.id));
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const cleared = page.waitForResponse(response => response.url().endsWith(`/records/${record.pageId}`)
    && response.request().method() === 'PATCH');
  await page.getByRole('row').filter({ has: page.getByRole('button', { name: title, exact: true }) })
    .getByRole('textbox', { name: remove.name, exact: true }).fill('');
  assert.ok((await cleared).ok());
  await expect.poll(async () => (await api(base + '/records/' + record.pageId)).values[remove.id]).toBeNull();
  dialog = await openRemoval();
  await dialog.getByRole('button', { name: 'Remove field', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  assert.equal((await api(base)).fields.some(field => field.id === remove.id), false);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('textbox', { name: remove.name, exact: true })).toHaveCount(0);

  // Export re-reads authorized data rather than downloading the stale rendered snapshot.
  const current = await api(base + '/records/' + record.pageId);
  const note = 'Fresh, "quoted"\nsecond line';
  await mutate(base + '/records/' + record.pageId, {
    expectedRevisionId: current.revisionId, values: { [keep.id]: note },
  }, 'PATCH');
  await page.getByRole('searchbox', { name: 'Find in this view', exact: true }).fill('Selected');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export view CSV', exact: true }).click();
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /\.csv$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.equal(csv, '"Name","Notes"\r\n"Selected, ""quoted"" record","Fresh, ""quoted""\nsecond line"\r\n');
  assert.equal((await api(base + '/records/' + record.pageId)).values[keep.id], note);
}

/** DB-003: native saved-view controls share configuration without writing record data. */
export async function savedViewsJourney(state) {
  const { withSecondPerson, call, ok } = await import('./two-people-support.mjs');
  const { accessible } = await import('./browser-evidence.mjs');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { root } = await import('../../e2e/runtime-harness.mjs');
  const width = state.page.viewportSize().width;
  await withSecondPerson(state, width, async ({ alice, bob }) => {
    const { origin } = state;
    const owner = (method, route, data) => ok(alice.context, origin, method, route, data);
    const editor = (method, route, data) => ok(bob.context, origin, method, route, data);
    const space = (await owner('POST', '/api/containers', { operationKey: randomUUID(), name: 'View management', visibility: 'private' })).value;
    const access = (await owner('POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: bob.id, level: 'edit' })).value;
    const database = (await owner('POST', '/api/databases', { operationKey: randomUUID(), containerId: space.id, title: 'Shared handovers' })).value;
    const base = `/api/databases/${database.id}`;
    const fields = [
      { id: randomUUID(), name: 'Notes', type: 'text', config: {}, position: 0 },
      { id: randomUUID(), name: 'Ready', type: 'checkbox', config: {}, position: 1 },
    ];
    for (const field of fields) await owner('POST', base + '/fields', {
      operationKey: randomUUID(), expectedRevisionId: (await owner('GET', base)).database.revision_id, field,
    });
    const recordIds = [];
    for (const [index, title] of ['Alpha handover', 'Bravo handover', 'Charlie handover'].entries()) {
      const record = (await owner('POST', base + '/records', { operationKey: randomUUID(), title, values: { [fields[0].id]: `Retain note ${index}`, [fields[1].id]: index !== 1 } })).value;
      const document = await owner('GET', `/api/pages/${record.pageId}`);
      await owner('PUT', `/api/pages/${record.pageId}/blocks`, {
        operationKey: randomUUID(), expectedRevisionId: document.page.revisionId,
        blocks: [{ id: randomUUID(), blockType: 'paragraph', treePosition: 'a0', content: { text: [{ text: `Retain body ${index}` }] } }],
      });
      recordIds.push(record.pageId);
    }
    const recordState = async () => Promise.all(recordIds.map(async id => {
      const record = await owner('GET', base + '/records/' + id);
      return { id, values: record.values, revisionId: record.revisionId, page: record.page.page, blocks: record.page.blocks };
    }));
    const before = await recordState();
    assert.ok(before.every(record => record.blocks.length === 1), 'Every retained record has a populated body.');
    const receipts = [];
    const unchanged = async () => assert.deepEqual(await recordState(), before, 'View management preserves record identifiers, values, bodies and revisions.');
    const open = async page => page.goto(`${origin}/app/databases/${database.id}`, { waitUntil: 'networkidle' });
    const tabs = page => page.getByRole('navigation', { name: 'Saved views', exact: true });
    const option = async name => {
      await bob.page.getByRole('button', { name: 'View options', exact: true }).click();
      await bob.page.getByRole('menuitem', { name, exact: true }).click();
    };
    const committed = async action => {
      const pending = bob.page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === base + '/views');
      await action();
      const response = await pending;
      assert.equal(response.status(), 200, await response.text());
      const submitted = response.request().postDataJSON(), result = await response.json();
      assert.equal(result.receipt.operationKey, submitted.operationKey);
      assert.equal(result.receipt.entity.id, database.id);
      assert.equal((await editor('GET', base)).database.revision_id, result.value.revisionId);
      receipts.push({ submitted, result });
      await unchanged();
      return result.value.view;
    };
    const shared = async () => {
      const expected = await editor('GET', base);
      await open(alice.page);
      const actual = await owner('GET', base);
      assert.deepEqual(actual.views, expected.views, 'Another authorized member reloads the exact committed shared views.');
      for (const view of expected.views) {
        await expect(tabs(alice.page).getByRole('button', { name: view.name, exact: true })).toBeVisible();
        const result = await owner('GET', base + '/views/' + view.id);
        assert.deepEqual(result.records.map(record => record.pageId).sort(), [...recordIds].sort(), 'Every named view reads the same populated record set.');
      }
      await unchanged();
      return actual;
    };
    await open(bob.page);
    assert.equal((await editor('GET', '/api/session')).member.role, 'member', 'The view manager is not the workspace owner.');
    assert.equal((await editor('GET', `/api/pages/${database.pageId}`)).permissions.canEdit, true);
    const created = [];
    for (const name of ['All handovers', 'Ready handovers', 'Detailed handovers']) {
      const added = await committed(() => option('Add view'));
      await expect(tabs(bob.page).getByRole('button', { name: added.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await option('View settings');
      const dialog = bob.page.getByRole('dialog', { name: 'View settings', exact: true });
      await dialog.getByLabel('Name', { exact: true }).fill(name);
      await dialog.locator('select[name=sortField]').selectOption('$title');
      await dialog.locator('select[name=direction]').selectOption('desc');
      await dialog.locator('select[name=groupField]').selectOption(fields[1].id);
      await dialog.getByLabel('Hide empty groups', { exact: true }).check();
      await dialog.getByRole('checkbox', { name: 'Ready', exact: true }).uncheck();
      await dialog.getByRole('button', { name: 'Add condition', exact: true }).click();
      await dialog.getByRole('combobox', { name: 'Field', exact: true }).selectOption(fields[0].id);
      await dialog.getByRole('combobox', { name: 'Condition', exact: true }).selectOption('contains');
      await dialog.getByRole('textbox', { name: 'Value', exact: true }).fill('Retain note');
      const saved = await committed(() => dialog.getByRole('button', { name: 'Save view', exact: true }).click());
      await expect(dialog).not.toBeVisible();
      created.push(saved);
      await shared();
    }
    assert.equal(new Set(created.map(view => view.id)).size, 3, 'Creating named views assigns independent identifiers.');
    let source = created[1];
    await tabs(bob.page).getByRole('button', { name: source.name, exact: true }).click();
    await bob.page.getByRole('button', { name: 'Calculate a total for Notes', exact: true }).click();
    source = await committed(() => bob.page.getByRole('menuitemradio', { name: 'Count', exact: true }).click());
    assert.deepEqual(source.calculations, { [fields[0].id]: 'count' });
    await shared();
    await option('View settings');
    const dialog = bob.page.getByRole('dialog', { name: 'View settings', exact: true });
    await dialog.getByLabel('Name', { exact: true }).fill('Shift handovers');
    await dialog.getByRole('combobox', { name: /^Layout/ }).selectOption('list');
    const renamed = await committed(() => dialog.getByRole('button', { name: 'Save view', exact: true }).click());
    await expect(dialog).not.toBeVisible();
    assert.equal(renamed.id, source.id, 'Renaming keeps the view identifier.');
    assert.equal(renamed.layout, 'list');
    assert.deepEqual(renamed.filters, [{ field: fields[0].id, op: 'contains', value: 'Retain note' }]);
    assert.deepEqual(renamed.sorts, [{ field: '$title', direction: 'desc' }]);
    assert.deepEqual(renamed.groups, [{ field: fields[1].id, hideEmpty: true }]);
    assert.deepEqual(renamed.display.visibleFieldIds, [fields[0].id]);
    assert.deepEqual(renamed.calculations, source.calculations);
    const afterRename = await shared();
    await expect(tabs(alice.page).getByRole('button', { name: source.name, exact: true })).toHaveCount(0);
    assert.equal(afterRename.views.length, 3);
    const duplicate = await committed(() => option('Duplicate view'));
    assert.ok(!created.some(view => view.id === duplicate.id), 'A duplicate has a fresh identifier.');
    assert.equal(duplicate.name, 'Shift handovers copy');
    for (const key of ['layout', 'filters', 'sorts', 'groups', 'calculations', 'display']) assert.deepEqual(duplicate[key], renamed[key], `Duplicating retains ${key}.`);
    const afterDuplicate = await shared();
    assert.equal(afterDuplicate.views.length, 4);
    await expect(tabs(bob.page).getByRole('button', { name: duplicate.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await accessible(bob.page, 'shared saved views managed by an editor');
    await option('Delete view');
    const deletion = bob.page.getByRole('dialog', { name: 'Delete this saved view?', exact: true });
    await expect(deletion).toContainText(duplicate.name);
    await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual((await editor('GET', base)).views, afterDuplicate.views, 'Cancel preserves the saved view.');
    await option('Delete view');
    const deleted = await committed(() => deletion.getByRole('button', { name: 'Delete view', exact: true }).click());
    await expect(deletion).not.toBeVisible();
    assert.equal(deleted.id, duplicate.id);
    const afterDelete = await shared();
    assert.deepEqual(afterDelete.views.map(view => view.id), afterRename.views.map(view => view.id), 'Deleting the copy preserves all other saved views.');
    await expect(tabs(alice.page).getByRole('button', { name: duplicate.name, exact: true })).toHaveCount(0);

    // The same signed-in editor loses edit authority. Saved captures cannot replay it back.
    await owner('POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, id: access.id, principalKind: 'member', principalId: bob.id, level: 'edit', revoke: true });
    await owner('POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: bob.id, level: 'view' });
    await open(bob.page);
    assert.equal((await editor('GET', `/api/pages/${database.pageId}`)).permissions.canEdit, false);
    await expect(bob.page.getByRole('button', { name: 'View options', exact: true })).toHaveCount(0);
    const viewerBefore = await editor('GET', base);
    assert.deepEqual(viewerBefore.views, afterDelete.views, 'A read-only member sees the shared saved views.');
    const { revisionId: ignoredRevision, ...view } = viewerBefore.views[0];
    const refusals = [];
    for (const input of [
      { view: { ...view, name: 'Refused rename' } },
      { view: { ...view, id: randomUUID(), name: 'Refused duplicate' } },
      { view, delete: true },
      receipts.find(entry => entry.submitted.view.id === duplicate.id && !entry.submitted.delete).submitted,
    ]) {
      const result = await call(bob.context, origin, 'POST', base + '/views', { operationKey: randomUUID(), expectedRevisionId: viewerBefore.database.revision_id, ...input });
      assert.equal(result.status, 404);
      assert.equal(result.body.code, 'NOT_FOUND');
      refusals.push(result);
      assert.deepEqual(await editor('GET', base), viewerBefore, 'A refused viewer mutation or revoked-editor replay changes no database or view.');
      await unchanged();
    }
    await open(alice.page);
    await expect(tabs(alice.page).getByRole('button', { name: duplicate.name, exact: true })).toHaveCount(0);
    assert.deepEqual((await owner('GET', base)).views, afterDelete.views, 'Replaying the deleted duplicate cannot resurrect it.');
    await accessible(bob.page, 'shared saved views read only after edit revocation');
    const evidence = `${root}/.artifacts/ui-convergence/saved-views`;
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/${width}.json`, JSON.stringify({ width, databaseId: database.id, before, after: await recordState(), receipts, refusals }, null, 2));
    console.log(`PROBE DB-003 acceptance 1 and 2: native saved-view controls at ${width}px -> three shared views, editor rename, fresh duplicate with retained configuration, confirmed deletion, four unchanged-state refusals and intact records`);
  });
}
