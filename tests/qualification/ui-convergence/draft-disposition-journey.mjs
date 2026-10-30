import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { createPage } from '../interface/create-page.mjs';
import { accessible, openNavigation } from './browser-support.mjs';
import { call, editable, ok } from './two-people-support.mjs';

/** Native author actions, retained trash, and a populated outsider's unchanged view. */
export async function draftDispositionJourney(state, people) {
  const { page, context, origin, api } = state;
  const { bob } = people;
  const width = page.viewportSize().width;
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const original = await api('/api/workspace');
  const policy = async value => {
    await page.goto(`${origin}/app/settings`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Edit workspace & policies', exact: true }).click();
    await page.locator('select[name="page.lifecycle.v1"]').selectOption(value);
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  };
  const shot = label => page.screenshot({ path: `.artifacts/ui-convergence/draft-disposition-${width}-${label}.png`, fullPage: true });
  const tree = view => view.getByRole('navigation', { name: 'Pages', exact: true });
  const notices = () => ok(bob.context, origin, 'GET', '/api/notifications');
  const outsiderTree = async () => (await ok(bob.context, origin, 'GET', '/api/pages')).items;
  const storedNotifications = async () => {
    // Read the real stores with the Worker stopped, after both browsers unmount.
    await Promise.all([page.goto('about:blank'), bob.page.goto('about:blank')]);
    return (await state.atRest("SELECT * FROM notifications ORDER BY id; SELECT * FROM notification_outbox ORDER BY id;")).map(result => result.results);
  };
  const read = id => api(`/api/pages/${id}`);
  const history = id => api(`/api/revisions/${id}`);
  const openDraft = async id => {
    await page.goto(`${origin}/app`, { waitUntil: 'networkidle' });
    await openNavigation(page);
    await tree(page).locator(`a[href="/app/pages/${id}"]`).click();
    await page.getByRole('textbox', { name: 'Page title', exact: true }).waitFor();
  };
  const createDraft = async (title, body) => {
    const id = await createPage(page, origin, space.id, title);
    await page.getByRole('textbox', { name: 'Page body', exact: true }).fill(body);
    await page.locator('.editor-save-status').filter({ hasText: /^Saved$/ }).waitFor();
    await expect.poll(async () => JSON.stringify((await read(id)).blocks)).toContain(body);
    assert.equal((await read(id)).page.lifecycle, 'draft');
    assert.ok((await history(id)).items.length > 1, 'Retention covers actual prior versions.');
    return id;
  };
  const more = () => page.getByRole('button', { name: 'More', exact: true }).click();
  try {
    await ok(context, origin, 'POST', '/api/sharing', { operationKey: crypto.randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: bob.id, level: 'view' });
    await bob.page.goto(`${origin}/app/containers/${space.id}`, { waitUntil: 'networkidle' });
    const watch = bob.page.getByRole('button', { name: 'Watch space', exact: true });
    if (await watch.isVisible()) await watch.click();
    await expect(bob.page.getByRole('button', { name: 'Stop watching space', exact: true })).toBeVisible();

    await policy('always-live');
    const control = (await ok(context, origin, 'POST', '/api/pages', { operationKey: crypto.randomUUID(), containerId: space.id, title: 'Draft disposition control' })).value.pageId;
    await page.goto(`${origin}/app/pages/${control}`, { waitUntil: 'networkidle' });
    await more();
    await expect(page.getByRole('menuitem', { name: /^Close draft|^Discard draft/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await state.runScheduled();
    const beforeTree = await outsiderTree();
    const beforeNotices = await notices();
    assert.ok(beforeTree.some(item => item.id === control), 'The outsider has real readable tree content.');
    assert.ok(beforeNotices.items.some(item => item.pageId === control), 'The outsider actively receives real watched notifications.');
    const beforeStored = await storedNotifications();

    await policy('draft-then-publish');
    const closedId = await createDraft('Close retained draft', 'Retained content after closing');
    const closed = await read(closedId), closedHistory = await history(closedId);
    await more();
    await expect(page.getByRole('menuitem', { name: 'Close draft', exact: true })).toBeEnabled();
    await accessible(page, `Draft disposition actions ${width}`);
    await shot('author-actions');
    await page.getByRole('menuitem', { name: 'Close draft', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/app');
    await openDraft(closedId);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(closed.page.title);
    await expect(editable(page, closed.blocks[0].id)).toHaveText('Retained content after closing');
    const reopened = await read(closedId);
    assert.equal(reopened.page.lifecycle, 'draft');
    assert.equal(reopened.page.id, closedId);
    assert.equal(reopened.workingRevisionId, closed.workingRevisionId);
    assert.equal(reopened.publishedRevisionId, null);
    assert.deepEqual(reopened.blocks, closed.blocks);
    assert.deepEqual(await history(closedId), closedHistory);
    await shot('reopened');
    await state.runScheduled();
    assert.deepEqual(await outsiderTree(), beforeTree, 'Closing leaves the outsider tree unchanged.');
    assert.deepEqual(await notices(), beforeNotices, 'Closing delivers no notification.');
    assert.deepEqual(await storedNotifications(), beforeStored, 'Closing creates no persisted notification or queued intent.');
    console.info(`PROBE LIFE-007 close: native Close draft, author tree and reload -> draft ${closedId}, identity, body and history retained; outsider tree and persisted notifications unchanged after scheduled processing`);

    const discardedId = await createDraft('Discard retained draft', 'Retained content after discarding');
    const discarded = await read(discardedId), discardedHistory = await history(discardedId);
    const input = { operationKey: crypto.randomUUID(), expectedRevisionId: discarded.page.revisionId, action: 'discard-draft' };
    assert.equal((await call(bob.context, origin, 'POST', `/api/archive/${discardedId}`, input)).status, 404, 'An outsider cannot discard an authored private draft.');
    assert.deepEqual((await read(discardedId)).blocks, discarded.blocks);
    await more();
    await page.getByRole('menuitem', { name: 'Discard draft', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Discard this draft?', exact: true });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await read(discardedId)).page.lifecycle, 'draft');
    await more();
    await page.getByRole('menuitem', { name: 'Discard draft', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Discard this draft?', exact: true });
    await expect(dialog).toContainText('content and history are retained');
    await shot('discard-confirmation');
    const submitted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/archive/${discardedId}`);
    await dialog.getByRole('button', { name: 'Discard draft', exact: true }).click();
    const response = await submitted;
    assert.equal(response.status(), 200);
    const submittedInput = response.request().postDataJSON();
    await page.waitForURL(url => url.pathname === '/app');
    await page.reload({ waitUntil: 'networkidle' });
    assert.ok(!(await api('/api/pages')).items.some(item => item.id === discardedId));
    const trash = (await api('/api/archive')).items.find(item => item.id === discardedId);
    assert.equal(trash.title, discarded.page.title);
    assert.ok(trash.trashedAt);
    assert.equal((await call(context, origin, 'GET', `/api/pages/${discardedId}`)).status, 404);
    assert.equal((await call(context, origin, 'POST', `/api/archive/${discardedId}`, submittedInput)).status, 200, 'Replaying the native discard is safe.');
    await page.goto(`${origin}/app/archive`, { waitUntil: 'networkidle' });
    await page.getByRole('group', { name: 'Archive and trash', exact: true }).getByRole('button', { name: 'Trash', exact: true }).click();
    await expect(page.getByRole('main')).toContainText(discarded.page.title);
    await shot('retained-trash');
    await state.runScheduled();
    assert.deepEqual(await outsiderTree(), beforeTree, 'Discarding adds no outsider tree entry.');
    assert.deepEqual(await notices(), beforeNotices, 'Discarding delivers no notification.');
    assert.deepEqual(await storedNotifications(), beforeStored, 'Discarding creates no persisted notification or queued intent.');

    // Restore through the native route to read the retained content and every version.
    await ok(context, origin, 'POST', `/api/archive/${discardedId}`, { operationKey: crypto.randomUUID(), expectedRevisionId: discarded.page.revisionId, action: 'restore' });
    await openDraft(discardedId);
    await page.reload({ waitUntil: 'networkidle' });
    const restored = await read(discardedId);
    assert.equal(restored.page.id, discardedId);
    assert.equal(restored.page.lifecycle, 'draft');
    assert.equal(restored.authorMemberId, discarded.authorMemberId);
    assert.equal(restored.workingRevisionId, discarded.workingRevisionId);
    assert.equal(restored.publishedRevisionId, null);
    assert.deepEqual(restored.blocks, discarded.blocks);
    assert.deepEqual(await history(discardedId), discardedHistory);
    await expect(editable(page, discarded.blocks[0].id)).toHaveText('Retained content after discarding');
    await shot('restored');
    await state.runScheduled();
    assert.deepEqual(await outsiderTree(), beforeTree);
    assert.deepEqual(await notices(), beforeNotices);
    assert.deepEqual(await storedNotifications(), beforeStored);
    await nestedDraftDiscardJourney(state, people);
    console.info(`PROBE LIFE-007 discard: native Discard draft, trash, replay and restore -> ${discardedId} retained with author, body and every version; outsider refusal and unchanged persisted notifications after scheduled processing`);
  } finally {
    await policy(original.policies['page.lifecycle.v1']);
  }
}

/** A published, watched descendant must share the dedicated draft disposition's silence. */
export async function nestedDraftDiscardJourney(state, { bob }) {
  const { page, context, origin, api } = state;
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const send = (method, route, data) => ok(context, origin, method, route, data);
  const read = id => api(`/api/pages/${id}`);
  const history = id => api(`/api/revisions/${id}`);
  const notices = () => ok(bob.context, origin, 'GET', '/api/notifications');
  const tree = () => ok(bob.context, origin, 'GET', '/api/pages');
  const create = async (title, parentPageId) => (await send('POST', '/api/pages', {
    operationKey: crypto.randomUUID(), containerId: space.id, parentPageId, title,
    blocks: [{ id: crypto.randomUUID(), blockType: 'paragraph', treePosition: 'a', content: { text: [{ text: `${title} retained body` }] } }],
  })).value.pageId;
  const parentId = await create('Nested retained draft');
  const childId = await create('Watched published child', parentId);
  await send('POST', `/api/pages/${childId}/publish`, { operationKey: crypto.randomUUID(), expectedRevisionId: (await read(childId)).page.revisionId });
  const parent = await read(parentId), child = await read(childId);
  const versions = await Promise.all([history(parentId), history(childId)]);
  assert.equal(parent.page.lifecycle, 'draft');
  assert.equal((await ok(bob.context, origin, 'GET', `/api/pages/${childId}`)).page.lifecycle, 'live');
  await state.runScheduled();
  const beforeNotices = await notices(), beforeTree = await tree();
  assert.ok(beforeNotices.items.some(item => item.pageId === childId), 'The other member receives the published child notification.');
  const stored = async () => {
    await Promise.all([page.goto('about:blank'), bob.page.goto('about:blank')]);
    return (await state.atRest('SELECT * FROM notifications ORDER BY id; SELECT * FROM notification_outbox ORDER BY id;')).map(row => row.results);
  };
  const beforeStored = await stored();
  await page.goto(`${origin}/app/pages/${parentId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Discard draft', exact: true }).click();
  const shot = label => page.screenshot({ path: `.artifacts/ui-convergence/draft-subtree-${page.viewportSize().width}-${label}.png`, fullPage: true });
  await shot('confirmation');
  const submitted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/archive/${parentId}`);
  await page.getByRole('dialog', { name: 'Discard this draft?', exact: true }).getByRole('button', { name: 'Discard draft', exact: true }).click();
  const response = await submitted;
  assert.equal(response.status(), 200);
  const input = response.request().postDataJSON();
  await page.waitForURL(url => url.pathname === '/app');
  await state.runScheduled();
  const afterNotices = await notices();
  const added = afterNotices.items.filter(item => !beforeNotices.items.some(prior => prior.id === item.id));
  console.info(`PROBE LIFE-007 BLOCKING A width=${page.viewportSize().width} addedNotifications=${JSON.stringify(added.map(item => ({event:item.event, pageId:item.pageId, href:item.href})))}`);
  assert.deepEqual(added, [], 'Discarding a draft with a published child delivers no notification to its watcher.');
  assert.deepEqual(await stored(), beforeStored, 'The whole retained subtree creates no notification or queued intent.');
  assert.deepEqual((await tree()).items, beforeTree.items.filter(item => item.id !== childId), 'No private draft trace appears in the other member tree.');
  for (const id of [parentId, childId]) {
    assert.ok((await api('/api/archive')).items.some(item => item.id === id && item.trashedAt));
    assert.equal((await call(context, origin, 'GET', `/api/pages/${id}`)).status, 404);
  }
  assert.equal((await call(bob.context, origin, 'POST', `/api/archive/${parentId}`, input)).status, 404);
  await send('POST', `/api/archive/${parentId}`, input);
  await page.goto(`${origin}/app/archive`, { waitUntil: 'networkidle' });
  await page.getByRole('group', { name: 'Archive and trash', exact: true }).getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(page.getByRole('main')).toContainText(child.page.title);
  await shot('retained-trash');
  await send('POST', `/api/archive/${parentId}`, { operationKey: crypto.randomUUID(), expectedRevisionId: parent.page.revisionId, action: 'restore' });
  const restoredParent = await read(parentId), restoredChild = await read(childId);
  for (const [before, after] of [[parent, restoredParent], [child, restoredChild]]) {
    assert.equal(after.page.id, before.page.id);
    assert.equal(after.page.lifecycle, before.page.lifecycle);
    assert.equal(after.authorMemberId, before.authorMemberId);
    assert.equal(after.workingRevisionId, before.workingRevisionId);
    assert.equal(after.publishedRevisionId, before.publishedRevisionId);
    assert.deepEqual(after.blocks, before.blocks);
  }
  assert.equal(restoredChild.parentPageId, parentId);
  assert.deepEqual(await Promise.all([history(parentId), history(childId)]), versions);
  await send('POST', `/api/archive/${parentId}`, input);
  assert.equal((await read(childId)).page.lifecycle, 'live', 'Replaying disposal after restore cannot trash the child again.');
  await page.goto(`${origin}/app/pages/${parentId}`, { waitUntil: 'networkidle' });
  await expect(editable(page, parent.blocks[0].id)).toContainText('Nested retained draft retained body');
  await shot('restored');
  // Ordinary live-page trash still notifies, and cannot use the dedicated disposition.
  assert.equal((await call(context, origin, 'POST', `/api/archive/${childId}`, {operationKey:crypto.randomUUID(), expectedRevisionId:child.page.revisionId, action:'discard-draft'})).status, 409);
  await send('POST', `/api/archive/${childId}`, { operationKey: crypto.randomUUID(), expectedRevisionId: child.page.revisionId, action: 'trash' });
  await state.runScheduled();
  assert.ok((await notices()).items.some(item => item.pageId === childId && item.event === 'page-trashed'), 'Generic trash keeps its watcher notification.');
  console.info(`PROBE LIFE-007 BLOCKING A PASS width=${page.viewportSize().width}: silent retained subtree, outsider refusal, replay, restored child lineage/body/history and generic trash notification`);
}
