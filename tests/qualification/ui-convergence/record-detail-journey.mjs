import {historyRows} from './history-inventory-journey.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
import {call, grant, ok, withSecondPerson} from './two-people-support.mjs';

/** Populated native records, independent member sessions and retained snapshots. */
export async function recordDetailJourney(state, width) {
  const {context, origin, api} = state;
  const mutate = (method, route, data, actor = context) => ok(actor, origin, method, route, {operationKey: randomUUID(), ...data});
  const workspace = await api('/api/workspace');
  const policies = async parity => {
    const current = await api('/api/workspace');
    const {name, mark, description, guestAccess, publicLinkAccess, anonymousAccess} = current;
    await mutate('PUT', '/api/workspace', {expectedRevisionId: current.revisionId, name, mark, description, guestAccess, publicLinkAccess, anonymousAccess,
      policies: {...workspace.policies, 'record.page-parity.v1': parity}});
  };
  const container = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const database = (await mutate('POST', '/api/databases', {containerId: container.id, title: 'Record detail proof'})).value;
  const base = `/api/databases/${database.id}`;
  // Insertion order differs from the defined field order.
  const fields = [
    {id: randomUUID(), name: 'Notes', type: 'text', config: {}, position: 2},
    {id: randomUUID(), name: 'Quantity', type: 'number', config: {}, position: 0},
    {id: randomUUID(), name: 'Created', type: 'created-at', config: {}, position: 3},
    {id: randomUUID(), name: 'Updated', type: 'updated-at', config: {}, position: 4},
    {id: randomUUID(), name: 'Record identifier', type: 'identifier', config: {}, position: 5},
  ];
  const [notes, quantity, created, updated, identifier] = fields;
  const computed = {id: randomUUID(), name: 'Double quantity', type: 'formula', position: 1,
    config: {expression: {op: 'multiply', args: [{field: quantity.id}, {literal: 2}]}}};
  let revision = database.revisionId;
  for (const field of [...fields, computed]) revision = (await mutate('POST', base + '/fields', {expectedRevisionId: revision, field})).value.revisionId;
  const record = (await mutate('POST', base + '/records', {title: 'Populated record', values: {[notes.id]: 'Retained notes', [quantity.id]: 7}})).value;
  const recordPath = base + '/records/' + record.pageId;
  const pagePath = `/api/pages/${record.pageId}`;
  const blockId = randomUUID();
  const beforeBody = await api(pagePath);
  await mutate('PUT', pagePath + '/blocks', {expectedRevisionId: beforeBody.page.revisionId,
    blocks: [{id: blockId, blockType: 'paragraph', treePosition: 'a', content: {text: [{text: 'Original retained record body'}]}}]});
  const earlier = await api(recordPath);
  await mutate('PATCH', pagePath + '/blocks/' + blockId, {expectedRevisionId: earlier.page.blocks[0].revisionId, content: {text: [{text: 'Current retained record body'}]}});
  const discussion = (await mutate('POST', `/api/comments/page/${record.pageId}`, {body: [{text: 'Retained record discussion'}]})).value;
  await grant(context, origin, database.pageId, 'browser-owner', 'full');
  await grant(context, origin, database.pageId, 'browser-reader', 'edit');
  await mutate('PUT', `/api/sharing/pages/${database.pageId}/inheritance`, {expectedRevisionId: (await api(`/api/pages/${database.pageId}`)).page.revisionId, restricted: true});
  const recordUrl = `${origin}/app/databases/${database.id}/records/${record.pageId}`;
  const orderedNames = ['Quantity', 'Double quantity', 'Notes', 'Created', 'Updated', 'Record identifier'];
  const row = (page, name) => page.locator('.record-field').filter({has: page.locator('dt').getByText(name, {exact: true})});
  const checkFields = async (page, canEdit, amount) => {
    await expect(page.locator('.record-field dt')).toHaveText(orderedNames);
    await expect(row(page, quantity.name).locator('dd')).toContainText(String(amount));
    await expect(row(page, computed.name).locator('dd')).toHaveText(String(amount * 2));
    await expect(row(page, notes.name).locator('dd')).toContainText('Retained notes');
    await expect(row(page, identifier.name).locator('dd')).toHaveText(record.pageId);
    const native = await api(recordPath);
    for (const field of [created, updated]) {
      assert.ok(Number.isFinite(Date.parse(native.values[field.id])));
      await expect(row(page, field.name).locator('dd')).not.toBeEmpty();
    }
    for (const field of [computed, created, updated, identifier]) await expect(row(page, field.name).getByRole('button')).toHaveCount(0);
    await expect(page.locator('.record-fields-list').getByRole('button', {name: 'Edit', exact: true})).toHaveCount(canEdit ? 2 : 0);
  };
  try {
    await withSecondPerson(state, width, async ({bob}) => {
      await policies('record-is-page');
      await bob.page.goto(recordUrl, {waitUntil: 'networkidle'});
      await checkFields(bob.page, true, 7);
      await row(bob.page, quantity.name).getByRole('button', {name: 'Edit', exact: true}).click();
      const dialog = bob.page.getByRole('dialog', {name: 'Edit Quantity', exact: true});
      await dialog.getByRole('spinbutton', {name: 'Quantity', exact: true}).fill('11');
      await dialog.getByRole('button', {name: 'Save value', exact: true}).click();
      await expect(dialog).not.toBeVisible();
      await bob.page.reload({waitUntil: 'networkidle'});
      await checkFields(bob.page, true, 11);
      await expect(bob.page.locator(`[data-block-id="${blockId}"]`).first()).toContainText('Current retained record body');
      console.log('PROBE DB-012 ordinary edit: native record Quantity 7 -> 11; computed value 22 and reload retained');

      // Downgrade the same independently signed-in member; its native writes must now refuse unchanged.
      const sharing = await api(`/api/sharing/pages/${database.pageId}`);
      const memberGrant = sharing.items.find(item => item.principalId === bob.id);
      await grant(context, origin, database.pageId, bob.id, 'view', {id: memberGrant.id});
      const retained = await api(recordPath);
      const historyBefore = await api(`/api/revisions/${record.pageId}`);
      const denied = await call(bob.context, origin, 'PATCH', recordPath, {operationKey: randomUUID(), expectedRevisionId: retained.revisionId, values: {[quantity.id]: 99}});
      assert.equal(denied.status, 404);
      assert.deepEqual(await api(recordPath), retained, 'A viewer write changes neither fields nor body nor revision.');
      assert.deepEqual(await api(`/api/revisions/${record.pageId}`), historyBefore);
      for (const parity of ['record-is-page', 'record-is-row', 'record-is-page']) {
        await policies(parity);
        await bob.page.goto(recordUrl, {waitUntil: 'networkidle'});
        await checkFields(bob.page, false, 11);
        const body = bob.page.locator(`[data-block-id="${blockId}"]`);
        if (parity === 'record-is-page') {
          await expect(body.first()).toContainText('Current retained record body');
          await expect(bob.page.locator('[data-page-editor] [contenteditable="true"]')).toHaveCount(0);
          await bob.page.getByRole('button', {name: 'Comments', exact: true}).click();
        } else {
          await expect(body).toHaveCount(0);
          await bob.page.getByText('Record comments', {exact: true}).click();
        }
        await expect(bob.page.locator('.comment-thread')).toContainText('Retained record discussion');
        await expect(bob.page.getByRole('button', {name: 'Send comment', exact: true})).toHaveCount(0);
        const comments = await ok(bob.context, origin, 'GET', `/api/comments/page/${record.pageId}`);
        assert.ok(comments.comments.some(comment => comment.threadId === discussion.threadId && comment.body[0].text === 'Retained record discussion'));
        if (parity === 'record-is-page') {
          await bob.page.locator('.detail-close').click();
          if (width === 390) {
            await bob.page.getByRole('button', {name: 'More', exact: true}).click();
            await bob.page.getByRole('menuitem', {name: 'History', exact: true}).click();
          } else await bob.page.getByRole('button', {name: 'History', exact: true}).click();
        } else await bob.page.getByText('Record history', {exact: true}).click();
        const revisions = await ok(bob.context, origin, 'GET', `/api/revisions/${record.pageId}`);
        assert.ok(revisions.items.some(item => item.id === earlier.revisionId));
        await historyRows(bob.page, revisions.items, workspace.policies['page.version.v1'] === 'labelled');
        const exactRead = bob.page.waitForResponse(response => new URL(response.url()).pathname === `/api/revisions/${record.pageId}/${earlier.revisionId}`);
        await bob.page.locator('.history-list > li').nth(revisions.items.findIndex(item => item.id === earlier.revisionId)).getByRole('button').click();
        const snapshot = await (await exactRead).json();
        assert.equal(snapshot.id, earlier.revisionId);
        assert.equal(snapshot.properties.databaseFields[quantity.id], 7);
        await expect(bob.page.locator('.revision-preview')).toContainText('Original retained record body');
        await expect(bob.page.locator('.revision-preview')).not.toContainText('Current retained record body');
        await expect(bob.page.getByRole('button', {name: 'Restore this revision', exact: true})).toHaveCount(0);
        assert.deepEqual((await api(pagePath)).blocks, retained.page.blocks, 'Parity changes and historical reads never drop or restore current content.');
        console.log(`PROBE DB-012 ${parity}: viewer fields, retained comments, exact historical body and unchanged stored current body passed`);
        await accessible(bob.page, `record detail ${parity}`);
      }
      console.log('PROBE DB-012 read-only: all six fields readable; native viewer PATCH -> 404 and unchanged record and history');
    });
  } finally { await policies(workspace.policies['record.page-parity.v1'] ?? 'record-is-page'); }
  await relationRecordsJourney(state, width);
}

/** Native relation settings, persisted target identities and two readers' current grants. */
export async function relationRecordsJourney(state, width) {
  const {page, context, origin, api} = state;
  const mutate = async (method, route, data) => (await ok(context, origin, method, route, {operationKey: randomUUID(), ...data})).value;
  const container = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const source = await mutate('POST', '/api/databases', {containerId: container.id, title: 'Relation source'});
  const target = await mutate('POST', '/api/databases', {containerId: container.id, title: 'Relation destinations'});
  const base = `/api/databases/${source.id}`;
  const targetBase = `/api/databases/${target.id}`;
  const first = await mutate('POST', targetBase + '/records', {title: 'First linked target', values: {}});
  const second = await mutate('POST', targetBase + '/records', {title: 'Second linked target', values: {}});
  const record = await mutate('POST', base + '/records', {title: 'Source relation record', values: {}});
  await grant(context, origin, source.pageId, 'browser-reader', 'edit');
  await grant(context, origin, target.pageId, 'browser-reader', 'view');
  await grant(context, origin, second.pageId, 'browser-owner', 'full');
  const targetGrant = (await grant(context, origin, second.pageId, 'browser-reader', 'view')).value;
  await mutate('PUT', `/api/sharing/pages/${second.pageId}/inheritance`, {expectedRevisionId: (await api(`/api/pages/${second.pageId}`)).page.revisionId, restricted: true});

  // The relation's database is chosen through the real field configuration door.
  await page.goto(`${origin}/app/databases/${source.id}`, {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: 'Fields', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Add field', exact: true}).click();
  let settings = page.getByRole('dialog', {name: 'Field settings', exact: true});
  await settings.getByRole('textbox', {name: 'Name', exact: true}).fill('Linked records');
  await settings.getByRole('combobox', {name: 'Type', exact: true}).selectOption('relation');
  await settings.getByRole('combobox', {name: 'Related database', exact: true}).selectOption(target.id);
  await settings.getByRole('button', {name: 'Save field', exact: true}).click();
  await expect(settings).not.toBeVisible();
  const field = (await api(base)).fields.find(item => item.name === 'Linked records');
  assert.equal(field.type, 'relation');
  assert.equal(field.config.databaseId, target.id);
  await page.reload({waitUntil: 'networkidle'});
  await page.getByRole('button', {name: 'Fields', exact: true}).click();
  await page.getByRole('menuitem', {name: field.name, exact: true}).click();
  settings = page.getByRole('dialog', {name: 'Field settings', exact: true});
  await expect(settings.getByRole('combobox', {name: 'Related database', exact: true})).toHaveValue(target.id);
  await accessible(page, 'relation configured database');
  await settings.getByRole('button', {name: 'Cancel', exact: true}).click();

  await mutate('POST', base + '/views', {expectedRevisionId: (await api(base)).database.revision_id,
    view: {id: randomUUID(), name: 'Relation table', layout: 'table', filters: [], sorts: [], groups: [],
      calculations: {}, display: {visibleFieldIds: [field.id]}, position: 0}});
  await page.reload({waitUntil: 'networkidle'});
  const pencil = page.getByRole('button', {name: `Edit ${field.name}`, exact: true});
  await pencil.focus();
  await expect.poll(() => pencil.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
  await accessible(page, 'relation field keyboard tooltip');

  const recordPath = base + '/records/' + record.pageId;
  const recordUrl = origin + `/app/databases/${source.id}/records/${record.pageId}`;
  const row = view => view.locator('.record-field').filter({has: view.locator('dt').getByText(field.name, {exact: true})});
  const selected = [first.pageId, second.pageId];
  await withSecondPerson(state, width, async ({bob}) => {
    const openPicker = async () => {
      await row(bob.page).getByRole('button', {name: 'Edit', exact: true}).click();
      const picker = bob.page.getByRole('dialog', {name: 'Choose Linked records', exact: true});
      await expect(picker.getByRole('checkbox')).toHaveCount(2);
      await expect(picker.getByRole('checkbox', {name: 'First linked target', exact: true})).toBeVisible();
      await expect(picker.getByRole('checkbox', {name: 'Second linked target', exact: true})).toBeVisible();
      await expect(picker).not.toContainText('Source relation record');
      return picker;
    };
    const save = async picker => {
      await picker.getByRole('button', {name: 'Save selection', exact: true}).click();
      await expect(picker).not.toBeVisible();
      await bob.page.reload({waitUntil: 'networkidle'});
    };
    await bob.page.goto(recordUrl, {waitUntil: 'networkidle'});
    let picker = await openPicker();
    await expect(picker).toContainText('0 selected');
    await picker.getByRole('checkbox', {name: 'First linked target', exact: true}).check();
    await save(picker);
    assert.deepEqual((await ok(bob.context, origin, 'GET', recordPath)).values[field.id], [first.pageId]);
    await expect(row(bob.page).getByRole('button', {name: 'First linked target', exact: true})).toBeVisible();
    picker = await openPicker();
    await expect(picker.getByRole('checkbox', {name: 'First linked target', exact: true})).toBeChecked();
    await picker.getByRole('button', {name: 'Clear selection', exact: true}).click();
    await save(picker);
    assert.deepEqual((await api(recordPath)).values[field.id], []);
    await expect(row(bob.page).getByRole('button', {name: 'First linked target', exact: true})).toHaveCount(0);
    picker = await openPicker();
    await picker.getByRole('checkbox', {name: 'First linked target', exact: true}).check();
    if (width === 1440) {
      await picker.getByRole('searchbox', {name: 'Find', exact: true}).fill('Second');
      await expect(picker.getByRole('checkbox')).toHaveCount(1);
      await expect(picker.getByRole('checkbox', {name: 'First linked target', exact: true})).toHaveCount(0);
      await expect(picker).toContainText('1 selected');
    }
    await picker.getByRole('checkbox', {name: 'Second linked target', exact: true}).check();
    if (width === 1440) {
      await expect(picker).toContainText('2 selected');
      await picker.getByRole('searchbox', {name: 'Find', exact: true}).fill('No matching target');
      await expect(picker.getByRole('checkbox')).toHaveCount(0);
      await expect(picker).toContainText('No accessible matches.');
      await expect(picker).toContainText('2 selected');
      await picker.getByRole('searchbox', {name: 'Find', exact: true}).fill('');
      await expect(picker.getByRole('checkbox')).toHaveCount(2);
      await expect(picker.getByRole('checkbox', {name: 'First linked target', exact: true})).toBeChecked();
      await expect(picker.getByRole('checkbox', {name: 'Second linked target', exact: true})).toBeChecked();
    }
    await accessible(bob.page, 'relation multiple target picker');
    await save(picker);
    assert.deepEqual((await api(recordPath)).values[field.id], selected);
    await expect(row(bob.page).getByRole('button', {name: 'First linked target', exact: true})).toBeVisible();
    await expect(row(bob.page).getByRole('button', {name: 'Second linked target', exact: true})).toBeVisible();
    await accessible(bob.page, 'relation retained multiple records');
    const prior = await api(`/api/pages/${first.pageId}`);
    await mutate('PATCH', `/api/pages/${first.pageId}`, {expectedRevisionId: prior.page.revisionId, properties: {title: 'Renamed linked target'}});
    await bob.page.reload({waitUntil: 'networkidle'});
    await expect(row(bob.page).getByRole('button', {name: 'First linked target', exact: true})).toHaveCount(0);
    if (width === 1440) {
      await row(bob.page).getByRole('button', {name: 'Edit', exact: true}).click();
      picker = bob.page.getByRole('dialog', {name: 'Choose Linked records', exact: true});
      await picker.getByRole('searchbox', {name: 'Find', exact: true}).fill('First linked target');
      await expect(picker).toContainText('No accessible matches.');
      await picker.getByRole('searchbox', {name: 'Find', exact: true}).fill('Renamed');
      await expect(picker.getByRole('checkbox')).toHaveCount(1);
      await expect(picker.getByRole('checkbox', {name: 'Renamed linked target', exact: true})).toBeChecked();
      await expect(picker).toContainText('2 selected');
      await picker.getByRole('button', {name: 'Cancel', exact: true}).click();
    }
    await row(bob.page).getByRole('button', {name: 'Renamed linked target', exact: true}).click();
    await expect(bob.page).toHaveURL(origin + `/app/databases/${target.id}/records/${first.pageId}`);
    await expect(bob.page.getByRole('heading', {name: 'Renamed linked target', exact: true})).toBeVisible();
    assert.deepEqual((await api(recordPath)).values[field.id], selected);
    await accessible(bob.page, 'relation follows retained renamed record');
    console.log(`PROBE DB-002 3 ${width}: native relation configuration, empty and multiple selections, reload, rename and canonical target address passed`);

    await page.goto(`${origin}/app/databases/${source.id}`, {waitUntil: 'networkidle'});
    await page.getByRole('button', {name: 'Fields', exact: true}).click();
    await page.getByRole('menuitem', {name: field.name, exact: true}).click();
    settings = page.getByRole('dialog', {name: 'Field settings', exact: true});
    await settings.getByRole('combobox', {name: 'Related database', exact: true}).selectOption(source.id);
    const refusedSettings = page.waitForResponse(response => new URL(response.url()).pathname === base + '/fields' && response.request().method() === 'POST');
    await settings.getByRole('button', {name: 'Save field', exact: true}).click();
    assert.equal((await refusedSettings).status(), 409);
    await expect(settings.getByRole('alert')).toContainText('Clear relation values');
    assert.equal((await api(base)).fields.find(item => item.id === field.id).config.databaseId, target.id);
    assert.deepEqual((await api(recordPath)).values[field.id], selected);
    await settings.getByRole('button', {name: 'Cancel', exact: true}).click();

    await grant(context, origin, second.pageId, bob.id, 'view', {id: targetGrant.id, revoke: true});
    const retained = await api(recordPath), history = await api(`/api/revisions/${record.pageId}`);
    assert.deepEqual(retained.values[field.id], selected);
    const reader = await ok(bob.context, origin, 'GET', recordPath);
    assert.deepEqual(reader.values[field.id], [first.pageId]);
    assert.ok(!JSON.stringify(reader).includes(second.pageId), "The complete reader document omits the revoked target identity.");
    const options = await ok(bob.context, origin, 'GET', `${base}/references/${field.id}`);
    assert.deepEqual(options.items.map(item => item.id), [first.pageId]);
    await bob.page.goto(recordUrl, {waitUntil: 'networkidle'});
    await expect(row(bob.page).getByRole('button', {name: 'Renamed linked target', exact: true})).toBeVisible();
    await expect(row(bob.page)).not.toContainText('Second linked target');
    await accessible(bob.page, 'relation current reader after revocation');
    await row(bob.page).getByRole('button', {name: 'Edit', exact: true}).click();
    picker = bob.page.getByRole('dialog', {name: 'Choose Linked records', exact: true});
    await expect(picker.getByRole('checkbox')).toHaveCount(1);
    await expect(picker.getByRole('checkbox', {name: 'Renamed linked target', exact: true})).toBeChecked();
    await expect(picker).toContainText('1 selected');
    await expect(picker).not.toContainText('Second linked target');
    await accessible(bob.page, 'relation reader safe picker after revocation');
    await picker.getByRole('button', {name: 'Cancel', exact: true}).click();
    const denied = await call(bob.context, origin, 'PATCH', recordPath, {operationKey: randomUUID(), expectedRevisionId: reader.revisionId, values: {[field.id]: selected}});
    assert.equal(denied.status, 404);
    assert.deepEqual(await api(recordPath), retained);
    assert.deepEqual(await api(`/api/revisions/${record.pageId}`), history);
    const inaccessible = origin + `/app/databases/${target.id}/records/${second.pageId}`;
    await bob.page.goto(inaccessible, {waitUntil: 'networkidle'});
    await expect(bob.page.getByRole('heading', {name: 'Access needed', exact: true})).toBeVisible();
    await expect(bob.page.locator('main')).not.toContainText('Second linked target');
    console.log(`PROBE DB-002 3 ${width}: revoked target removed from native values, labels and picker; retained owner identities unchanged; forbidden write and follow refused`);
  });
}
