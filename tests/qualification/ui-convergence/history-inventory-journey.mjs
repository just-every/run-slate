import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
import {call, grant, ok} from './two-people-support.mjs';

/** Compare the populated rendered list with the native history, including origin. */
export async function historyRows(page, items, labelled) {
  const rows = page.locator('.history-list > li');
  await expect(rows).toHaveCount(items.length);
  for (const [index, item] of items.entries()) {
    const row = rows.nth(index);
    await expect(row.locator('time').first()).toHaveAttribute('datetime', item.createdAt);
    await expect(row).toContainText(item.authorDisplayName);
    await expect(row).toContainText(item.origin);
    if (labelled && item.ordinal) await expect(row).toContainText(`Version ${item.ordinal}`);
    if (labelled && item.label) await expect(row).toContainText(item.label);
    if (!labelled) await expect(row).not.toContainText(/Version \d/);
  }
}

/** Page, database-page and record-page history through native mutations and pages. */
export async function historyInventoryJourney(state, people) {
  const {origin} = state, {alice, bob, record, shot} = people;
  const original = await ok(alice.context, origin, 'GET', '/api/workspace');
  const profile = async changes => {
    const w = await ok(alice.context, origin, 'GET', '/api/workspace');
    const {name, mark, description, guestAccess, publicLinkAccess, anonymousAccess} = w;
    await ok(alice.context, origin, 'PUT', '/api/workspace', {operationKey: randomUUID(), expectedRevisionId: w.revisionId, name, mark, description, guestAccess, publicLinkAccess, anonymousAccess, policies: {...w.policies, ...changes}});
  };
  const native = (method, path, data, actor = alice) => ok(actor.context, origin, method, path, data === undefined ? undefined : {operationKey: randomUUID(), ...data});
  const containerId = (await native('GET', '/api/containers')).items.find(item => item.name === 'Handbook').id;
  try {
    for (const policy of ['autosnapshot', 'labelled']) {
      await profile({'page.lifecycle.v1': 'draft-then-publish', 'page.version.v1': policy, 'record.page-parity.v1': 'record-is-page'});
      const database = await native('POST', '/api/databases', {containerId, title: `History database ${policy}`});
      const db = database.value;
      const field = {id: randomUUID(), name: 'Quantity', type: 'number', config: {}, position: 0};
      await native('POST', `/api/databases/${db.id}/fields`, {expectedRevisionId: db.revisionId, field});
      const ordinary = await native('POST', '/api/pages', {containerId, title: `History page ${policy}`});
      const recordPage = await native('POST', `/api/databases/${db.id}/records`, {title: `History record ${policy}`, values: {[field.id]: 7}});
      for (const [family, created, route] of [
        ['page', ordinary, `/app/pages/${ordinary.value.pageId}`],
        ['database', database, `/app/databases/${db.id}`],
        ['record', recordPage, `/app/databases/${db.id}/records/${recordPage.value.pageId}`],
      ]) {
        const pageId = created.value.pageId, path = `/api/pages/${pageId}`, historyPath = `/api/revisions/${pageId}`;
        if (family === 'record') await grant(alice.context, origin, db.pageId, bob.id, 'view');
        const read = () => native('GET', path);
        await grant(alice.context, origin, pageId, 'browser-owner', 'full');
        const inheritance = await native('PUT', `/api/sharing/pages/${pageId}/inheritance`, {expectedRevisionId: (await read()).page.revisionId, restricted: true});
        const allowed = await grant(alice.context, origin, pageId, bob.id, 'edit');
        const committed = [], receipts = [inheritance.receipt];
        const capture = async (result, actor = alice, metadata = {}) => {
          const document = await read();
          receipts.push(result.receipt);
          assert.equal(document.workingRevisionId, result.receipt.revisionId);
          committed.push({id: result.receipt.revisionId, createdAt: result.receipt.committedAt, authorMemberId: actor === alice ? 'browser-owner' : bob.id, authorDisplayName: actor.name, origin: 'autosave', ordinal: null, label: null, ...metadata,
            snapshot: {blocks: document.blocks, properties: document.properties}});
          return result;
        };
        await capture(created);
        committed.push({...committed[0], id: inheritance.receipt.revisionId, createdAt: inheritance.receipt.committedAt});
        const blockId = randomUUID();
        await capture(await native('PUT', path + '/blocks', {expectedRevisionId: (await read()).page.revisionId, blocks: [{id: blockId, blockType: 'paragraph', treePosition: 'a', content: {text: [{text: `Original ${family} history body`}]}}]}));
        const publish = async (actor, ordinal, label) => capture(await native('POST', path + '/publish', {expectedRevisionId: (await read()).page.revisionId, ...(policy === 'labelled' ? {label} : {})}, actor), actor,
          {origin: 'publish', ordinal: policy === 'labelled' ? ordinal : null, label: policy === 'labelled' ? label : null});
        const first = await publish(alice, 1, 'Original release');
        await capture(await native('PATCH', path + `/blocks/${blockId}`, {expectedRevisionId: (await read()).blocks[0].revisionId, content: {text: [{text: `Current ${family} history body`}]}}, bob), bob);
        if (family === 'record') await capture(await native('PATCH', `/api/databases/${db.id}/records/${pageId}`, {expectedRevisionId: (await read()).page.revisionId, values: {[field.id]: 11}}, bob), bob);
        const second = await publish(bob, 2, 'Current release');
        await capture(await native('PATCH', path, {expectedRevisionId: (await read()).page.revisionId, properties: {title: `Unpublished ${family} history title`}}));
        const expected = [...committed].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        const history = (await native('GET', historyPath)).items;
        assert.deepEqual(history.map(({id, createdAt, authorMemberId, authorDisplayName, origin, ordinal, label}) => ({id, createdAt, authorMemberId, authorDisplayName, origin, ordinal, label})), expected.map(({snapshot, ...metadata}) => metadata));
        for (const item of committed) {
          const snapshot = await native('GET', `${historyPath}/${item.id}`);
          assert.deepEqual({blocks: snapshot.blocks, properties: snapshot.properties}, item.snapshot, 'The exact selected revision keeps its committed body and properties.');
        }
        await alice.page.goto(`${origin}${route}?detail=history`, {waitUntil: 'networkidle'});
        await historyRows(alice.page, history, policy === 'labelled');
        await shot('alice', `${family} ${policy} full newest-first history`);
        // Published-only readers can reopen both permitted snapshots after reload.
        await grant(alice.context, origin, pageId, bob.id, 'view', {id: allowed.value.id});
        const visible = (await native('GET', historyPath, undefined, bob)).items;
        assert.deepEqual(visible.map(item => item.id), [second.receipt.revisionId, first.receipt.revisionId]);
        const url = `${origin}${route}?detail=history&revision=${first.receipt.revisionId}`;
        await bob.page.goto(url, {waitUntil: 'networkidle'});
        await bob.page.reload({waitUntil: 'networkidle'});
        await historyRows(bob.page, visible, policy === 'labelled');
        const preview = bob.page.locator('.revision-preview');
        await expect(preview).toContainText(`Original ${family} history body`);
        await expect(preview).not.toContainText(`Current ${family} history body`);
        await expect(preview.locator('[contenteditable=true], input, textarea')).toHaveCount(0);
        await expect(preview.getByRole('button', {name: 'Restore this revision', exact: true})).toHaveCount(0);
        await expect(preview.getByRole('button', {name: 'Delete this intermediate revision', exact: true})).toHaveCount(0);
        const latest = bob.page.locator('.history-list > li').first().getByRole('button');
        await latest.click();
        await expect(preview).toContainText(`Current ${family} history body`);
        await expect(preview).not.toContainText(`Original ${family} history body`);
        await shot('bob', `${family} ${policy} complete history after reload`);
        await accessible(bob.page, `REV-002 ${family} ${policy} history`);
        const before = await native('GET', historyPath);
        for (const method of ['PATCH', 'PUT']) {
          const refused = await call(alice.context, origin, method, `${historyPath}/${first.receipt.revisionId}`, {operationKey: randomUUID(), blocks: [], properties: {title: 'Rewritten history'}, authorMemberId: bob.id, createdAt: '2000-01-01T00:00:00.000Z', origin: 'publish', ordinal: 99, label: 'Rewritten history'});
          assert.equal(refused.status, 404);
          assert.deepEqual(await native('GET', historyPath), before);
          const snapshot = await native('GET', `${historyPath}/${first.receipt.revisionId}`);
          assert.deepEqual({blocks: snapshot.blocks, properties: snapshot.properties}, committed.find(item => item.id === first.receipt.revisionId).snapshot);
        }
        // A copied URL and the native list and detail doors disclose nothing after revocation.
        await grant(alice.context, origin, pageId, bob.id, 'view', {id: allowed.value.id, revoke: true});
        for (const door of [historyPath, `${historyPath}/${first.receipt.revisionId}`]) {
          const refused = await call(bob.context, origin, 'GET', door);
          assert.deepEqual(refused, {status: 404, body: {code: 'NOT_FOUND', message: 'Not found.'}});
        }
        await bob.page.goto(url, {waitUntil: 'networkidle'});
        await bob.page.reload({waitUntil: 'networkidle'});
        const refusedScreen = family === 'database' ? bob.page.getByRole('alert') : bob.page.getByRole('heading', {name: 'Access needed', exact: true});
        await expect(refusedScreen).toBeVisible();
        await expect(bob.page.locator('.history-list, .revision-preview')).toHaveCount(0);
        await expect(bob.page.locator('main')).not.toContainText(`Original ${family} history body`);
        record(`history-${policy}-${family}`, {receipts, committed, visible, revoked: 404});
        console.log(`PROBE REV-002 ${policy} ${family}: native commits -> ${history.length} exact rows and snapshots; visible actor, time, origin and labels; reader reload and revoked refusal passed`);
      }
    }
  } finally { await profile(original.policies); }
}
