import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible, closeDetails, openPageAction } from './browser-support.mjs';
import { call, ok, restrictedPage } from './two-people-support.mjs';
import { signInWithOutbox } from '../../e2e/outbox-auth.mjs';

const content = blocks => blocks.map(({ id, blockType, content, parentBlockId, treePosition }) => ({ id, blockType, content, parentBlockId, treePosition }));

/** Current member authority covers publication and retained versions as well as typing. */
export async function permissionLifecycleMatrix({ state, bob, api, level, pageId, snapshot, refuse, records }) {
  const { origin } = state, view = bob.page, route = `/api/pages/${pageId}`;
  const canEdit = ['full', 'edit'].includes(level);
  const workspace = await api('/api/workspace');
  const policy = async policies => {
    const { id, revisionId, ...fields } = await api('/api/workspace');
    await ok(state.context, origin, 'PUT', '/api/workspace', { ...fields, operationKey: randomUUID(), expectedRevisionId: revisionId, policies });
  };
  await policy({ ...workspace.policies, 'page.lifecycle.v1': 'draft-then-publish' });
  try {
  const read = () => api(route);
  const reopen = () => view.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const capture = async (target, action, perform, verify) => {
    const before = await snapshot();
    const pending = view.waitForResponse(response => new URL(response.url()).pathname === target && response.request().method() === 'POST');
    await perform();
    const response = await pending;
    assert.equal(response.status(), 200, await response.text());
    const input = response.request().postDataJSON(), result = await response.json();
    await view.waitForLoadState('networkidle');
    // Rendering an updated working revision has its own durable read receipt.
    if ((await read()).workingRevisionId !== before.document.workingRevisionId) {
      await expect.poll(async () => (await api('/api/activity?' + new URLSearchParams({ actorId: bob.id, action: 'pages.open', limit: '100' }))).items
        .some(item => item.target.id === pageId && item.context.revisionId === (action === 'pages.restore' && target.endsWith('discard-changes') ? before.document.publishedRevisionId : result.receipt.revisionId)),
      { timeout: 15000, intervals: [250, 500] }).toBe(true);
    }
    const after = await snapshot();
    assert.equal(result.receipt.operationKey, input.operationKey);
    assert.equal(after.document.page.revisionId, result.receipt.revisionId);
    const added = after.activity.filter(item => !before.activity.some(previous => previous.id === item.id) && item.action !== 'pages.open');
    assert.equal(added.length, 1);
    assert.deepEqual([added[0].id, added[0].action, added[0].actor.id, added[0].operationKey],
      [result.receipt.activityId, action, bob.id, input.operationKey]);
    for (const item of before.activity) assert.deepEqual(after.activity.find(candidate => candidate.id === item.id), item);
    for (const item of before.revisions.items) assert.deepEqual(after.revisions.items.find(candidate => candidate.id === item.id), item);
    assert.equal(after.revisions.items.length, before.revisions.items.length + 1);
    assert.deepEqual(after.comments, before.comments);
    const grants = structuredClone(before.grants);
    for (const item of [...grants.items, ...grants.effectiveItems]) item.origin.name = after.document.page.title;
    // Private lifecycle pages suppress inheritance provenance. The direct
    // grant rows, effective authority and restricted setting remain exact.
    grants.restriction = ['draft', 'scheduled'].includes(after.document.page.lifecycle)
      ? null : { scope: 'page', id: pageId, name: after.document.page.title };
    assert.deepEqual(after.grants, grants, 'Lifecycle writes retain every grant and reconcile only title and private inheritance provenance.');
    await verify(before, after, result);
    assert.deepEqual((await ok(bob.context, origin, 'POST', target, input)).receipt, result.receipt);
    assert.deepEqual(await snapshot(), after, 'A publication or version replay changes no retained inventory.');
    records.push({ level, method: 'POST', target, input, result, before, after });
    return result;
  };
  await reopen();
  const original = await read(), revisionId = original.publishedRevisionId;
  const historical = await api(`/api/revisions/${pageId}/${revisionId}`);
  await openPageAction(view, 'History');
  const history = view.locator('.history-list li').filter({ has: view.locator(`time[datetime="${historical.createdAt}"]`) }).first();
  await history.getByRole('button').click();
  await expect(view.locator('.revision-preview')).toContainText(historical.properties.title);
  await expect(view.getByRole('button', { name: 'Restore this revision', exact: true })).toHaveCount(canEdit ? 1 : 0);
  if (canEdit) {
    await capture(`/api/revisions/${pageId}/${revisionId}/restore`, 'pages.restore', async () => {
      await view.getByRole('button', { name: 'Restore this revision', exact: true }).click();
      await view.getByRole('dialog', { name: 'Restore this revision?', exact: true }).getByRole('button', { name: 'Restore revision', exact: true }).click();
    }, async (_before, after) => {
      assert.deepEqual(after.document.properties, historical.properties);
      assert.deepEqual(content(after.document.blocks), content(historical.blocks));
    });
  } else {
    await refuse('POST', `/api/revisions/${pageId}/${revisionId}/restore`, { operationKey: randomUUID(), expectedRevisionId: original.page.revisionId });
  }
  await accessible(view, `${level} revision restore authority`);
  await closeDetails(view);
  await reopen();
  await view.getByRole('button', { name: 'More', exact: true }).click();
  const publication = view.getByRole('menuitem', { name: 'Publish workspace revision', exact: true });
  await expect(publication).toHaveCount(canEdit ? 1 : 0);
  if (canEdit) {
    await publication.click();
    const dialog = view.getByRole('dialog', { name: 'Publish this revision', exact: true });
    await expect(dialog.getByRole('button', { name: 'Review publication', exact: true })).toBeEnabled();
    for (const label of ['Change destination when publishing', 'General access when published']) {
      if (level === 'full') await expect(dialog.getByLabel(label)).toBeEnabled();
      else await expect(dialog.getByLabel(label)).toBeDisabled();
    }
    const schedule = dialog.locator('input[name="publishAt"]');
    if (level === 'full') await expect(schedule).toBeEnabled();
    else await expect(schedule).toBeDisabled();
    await accessible(view, `${level} publication authority before review`);
    await dialog.getByRole('button', { name: 'Review publication', exact: true }).click();
    await capture(`${route}/publish`, 'pages.publish', () => dialog.getByRole('button', { name: 'Publish workspace revision', exact: true }).click(),
      async (before, after, result) => {
        assert.equal(after.document.page.lifecycle, 'live');
        assert.equal(after.document.publishedRevisionId, result.receipt.revisionId);
        assert.equal(after.document.workingRevisionId, result.receipt.revisionId);
        assert.deepEqual(after.document.properties, before.document.properties);
        assert.deepEqual(content(after.document.blocks), content(before.document.blocks));
      });
    await reopen();
    // Create a genuine unpublished revision before exercising native discard.
    const published = await read(), title = `Unpublished ${level} handover`;
    await ok(bob.context, origin, 'PATCH', route, { operationKey: randomUUID(), expectedRevisionId: published.page.revisionId, properties: { title } });
    await reopen();
    assert.equal((await read()).page.title, title);
    await openPageAction(view, 'Discard unpublished changes');
    await capture(`${route}/discard-changes`, 'pages.restore',
      () => view.getByRole('dialog', { name: 'Confirm this page change', exact: true }).getByRole('button', { name: 'Confirm', exact: true }).click(),
      async (before, after) => {
        assert.equal(after.document.page.lifecycle, 'live');
        assert.equal(after.document.workingRevisionId, before.document.publishedRevisionId);
        assert.equal(after.document.publishedRevisionId, before.document.publishedRevisionId);
        assert.deepEqual(after.document.properties, published.properties);
        assert.deepEqual(content(after.document.blocks), content(published.blocks));
      });
    await reopen();
    await expect(view.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(published.page.title);
  } else {
    await view.keyboard.press('Escape');
    for (const target of [`${route}/publish-preview`, `${route}/publish`, `${route}/cancel-schedule`, `${route}/discard-changes`]) {
      await refuse('POST', target, { operationKey: randomUUID(), expectedRevisionId: (await read()).page.revisionId });
    }
  }
  // Scheduling a live page makes it private. The existing server requires full.
  if (level === 'full') {
    await openPageAction(view, 'Publish workspace revision');
    let dialog = view.getByRole('dialog', { name: 'Publish this revision', exact: true });
    await expect(dialog.getByRole('button', { name: 'Review publication', exact: true })).toBeEnabled();
    const future = await view.evaluate(() => {
      const instant = new Date(Date.now() + 3600000);
      return new Date(instant.getTime() - instant.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    });
    await dialog.locator('input[name="publishAt"]').fill(future);
    await dialog.getByRole('button', { name: 'Review publication', exact: true }).click();
    await capture(`${route}/publish`, 'pages.publish', () => dialog.getByRole('button', { name: 'Publish workspace revision', exact: true }).click(),
      async (_before, after, result) => {
        assert.equal(result.value.scheduled, true);
        assert.equal(after.document.page.lifecycle, 'scheduled');
        assert.equal(after.document.schedule.state, 'scheduled');
        assert.equal(after.document.workingRevisionId, result.receipt.revisionId);
      });
    await reopen();
    await accessible(view, 'full member scheduled publication');
    await openPageAction(view, 'Cancel scheduled publication');
    await capture(`${route}/cancel-schedule`, 'pages.schedule.cancel',
      () => view.getByRole('dialog', { name: 'Confirm this page change', exact: true }).getByRole('button', { name: 'Confirm', exact: true }).click(),
      async (before, after) => {
        assert.equal(after.document.page.lifecycle, 'draft');
        assert.equal(after.document.publishedRevisionId, null);
        assert.equal(after.document.workingRevisionId, before.document.workingRevisionId);
        assert.deepEqual(content(after.document.blocks), content(before.document.blocks));
      });
    await reopen();
    await openPageAction(view, 'Publish workspace revision');
    dialog = view.getByRole('dialog', { name: 'Publish this revision', exact: true });
    await expect(dialog.getByRole('button', { name: 'Review publication', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Review publication', exact: true }).click();
    await capture(`${route}/publish`, 'pages.publish', () => dialog.getByRole('button', { name: 'Publish workspace revision', exact: true }).click(),
      async (_before, after, result) => {
        assert.equal(after.document.page.lifecycle, 'live');
        assert.equal(after.document.publishedRevisionId, result.receipt.revisionId);
      });
    await reopen();
  } else {
    await refuse('POST', `${route}/publish`, { operationKey: randomUUID(), expectedRevisionId: (await read()).page.revisionId, publishAt: new Date(Date.now() + 3600000).toISOString() });
  }
  await accessible(view, `${level} publication and discard after reload`);
  } finally { await policy(workspace.policies); }
}

/** Archive rows expose only actions carried by the current page grant. */
export async function permissionArchiveMatrix({ state, bob, api, level, pageId, snapshot, records, refusals }) {
  const { context, origin } = state, view = bob.page, route = `/api/pages/${pageId}`, target = `/api/archive/${pageId}`;
  const canEdit = ['full', 'edit'].includes(level), canDelete = level === 'full';
  const starting = await snapshot(), containerId = starting.document.page.containerId;
  // Restoring at a space root also needs destination authority. The page remains
  // restricted, so this independent destination grant cannot elevate its level.
  const authority = { targetKind: 'container', targetId: containerId, principalKind: 'member', principalId: bob.id, level: 'edit' };
  const destinationGrant = await ok(context, origin, 'POST', '/api/sharing', { ...authority, operationKey: randomUUID() });
  const inventory = async () => {
    const [activity, document, revisions, comments, grants, archive] = await Promise.all([
      snapshotActivity(), call(context, origin, 'GET', route),
      call(context, origin, 'GET', `/api/revisions/${pageId}`),
      call(context, origin, 'GET', `/api/comments/page/${pageId}`),
      call(context, origin, 'GET', `/api/sharing/pages/${pageId}`), api('/api/archive'),
    ]);
    return { document, revisions, comments, grants, archive, activity };
  };
  const snapshotActivity = async () => {
    const items = []; let cursor;
    do {
      const result = await api('/api/activity?' + new URLSearchParams({ from: starting.document.createdAt, limit: '100', ...(cursor ? { cursor } : {}) }));
      items.push(...result.items); cursor = result.nextCursor;
    } while (cursor);
    return items.filter(item => item.target.id === pageId || item.context?.pageId === pageId);
  };
  const mutate = async (actor, input, perform) => {
    const before = await inventory();
    const pending = perform ? view.waitForResponse(response => new URL(response.url()).pathname === target && response.request().method() === 'POST') : null;
    let result;
    if (perform) {
      await perform();
      const response = await pending;
      assert.equal(response.status(), 200, await response.text());
      input = response.request().postDataJSON(); result = await response.json();
    } else result = await ok(actor, origin, 'POST', target, input);
    await view.waitForLoadState('networkidle');
    const after = await inventory();
    const changes = after.activity.filter(item => !before.activity.some(previous => previous.id === item.id) && item.action !== 'pages.open');
    assert.equal(changes.length, 1);
    assert.deepEqual([changes[0].id, changes[0].action, changes[0].actor.id, changes[0].operationKey],
      [result.receipt.activityId, `archive.${input.action}`, actor === bob.context ? bob.id : 'browser-owner', input.operationKey]);
    for (const item of before.activity) assert.deepEqual(after.activity.find(candidate => candidate.id === item.id), item);
    assert.deepEqual((await ok(actor, origin, 'POST', target, input)).receipt, result.receipt);
    assert.deepEqual(await inventory(), after, 'An archive capture does not repeat or undo a later transition.');
    if (actor === bob.context) records.push({ level, method: 'POST', target, input, result, before, after });
    return result;
  };
  for (const action of ['archive', 'trash']) {
    const before = await snapshot();
    if (canEdit) {
      await view.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
      await openPageAction(view, action === 'archive' ? 'Archive page' : 'Move to trash');
      await mutate(bob.context, null, async () => {
        const dialog = view.getByRole('dialog', { name: action === 'archive' ? 'Archive this page?' : 'Move this page to trash?', exact: true });
        await dialog.getByRole('textbox', { name: 'Reason', exact: true }).fill(`Permission ${level} ${action} review`);
        await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
      });
    } else {
      const input = { operationKey: randomUUID(), expectedRevisionId: before.document.page.revisionId, action };
      const unchanged = await inventory(), refused = await call(bob.context, origin, 'POST', target, input);
      assert.equal(refused.status, 404);
      assert.deepEqual(await inventory(), unchanged);
      refusals.push({ level, method: 'POST', target, input, result: refused, before: unchanged, after: unchanged });
      await mutate(context, input);
    }
    await view.goto(`${origin}/app/archive`, { waitUntil: 'networkidle' });
    if (action === 'trash') await view.getByRole('button', { name: 'Trash', exact: true }).click();
    await view.reload({ waitUntil: 'networkidle' });
    if (action === 'trash') await view.getByRole('button', { name: 'Trash', exact: true }).click();
    const projection = (await ok(bob.context, origin, 'GET', '/api/archive')).items.find(item => item.id === pageId);
    assert.ok(projection);
    assert.deepEqual(projection.permissions, { canRestore: canEdit, canDelete });
    const row = view.locator('.archive-list > li').filter({ has: view.getByRole('heading', { name: projection.title, exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(canEdit ? 1 : 0);
    await expect(row.getByRole('button', { name: 'Delete permanently', exact: true })).toHaveCount(action === 'trash' && canDelete ? 1 : 0);
    await accessible(view, `${level} ${action} controls after reload`);
    const input = { operationKey: randomUUID(), expectedRevisionId: projection.revisionId, action: 'restore' };
    if (canEdit) await mutate(bob.context, null, () => row.getByRole('button', { name: 'Restore', exact: true }).click());
    else {
      const unchanged = await inventory(), refused = await call(bob.context, origin, 'POST', target, input);
      assert.equal(refused.status, 404);
      assert.deepEqual(await inventory(), unchanged, 'Read-only restore changes no retained state.');
      refusals.push({ level, method: 'POST', target, input, result: refused, before: unchanged, after: unchanged });
      await mutate(context, input);
    }
    await view.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    const after = await snapshot();
    assert.ok(after.document.updatedAt >= before.document.updatedAt);
    assert.deepEqual({ ...after.document, updatedAt: before.document.updatedAt }, before.document, 'Archive and trash retain content, authorship, grants and exact page and block revisions.');
    assert.deepEqual(after.revisions, before.revisions);
    assert.deepEqual(after.comments, before.comments);
    assert.deepEqual(after.grants, before.grants);
    assert.ok(!(await api('/api/archive')).items.some(item => item.id === pageId));
  }
  await ok(context, origin, 'POST', '/api/sharing', { ...authority, id: destinationGrant.value.id, revoke: true, operationKey: randomUUID() });
  await view.reload({ waitUntil: 'networkidle' });
}

/** A full direct grant permits erasure without authorship or workspace ownership. */
export async function permissionPermanentDeleteMatrix({ state, bob, api, level, records }) {
  const { context, origin } = state, view = bob.page;
  // Mailbox possession is refreshed through the native development edge, never
  // by changing a proof row or relaxing the server's sensitive-operation window.
  const member = (await ok(bob.context, origin, 'GET', '/api/session')).member;
  const signedIn = await signInWithOutbox(origin, member.email);
  assert.equal(signedIn.body.member.id, bob.id);
  assert.equal(signedIn.body.member.role, 'member');
  await bob.context.addCookies([{ name: 'slate_session', value: signedIn.cookie.split('=')[1], url: origin }]);
  const title = `Retired ${level} permission note`, body = `Retained ${level} escalation guidance.`;
  const { pageId, blockIds: [blockId] } = await restrictedPage(state, title, [body]);
  const route = `/api/pages/${pageId}`, target = `/api/archive/${pageId}/permanent-delete`;
  const grantInput = { operationKey: randomUUID(), targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: bob.id, level };
  const granted = await ok(context, origin, 'POST', '/api/sharing', grantInput);
  let document = await api(route);
  const writeInput = { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, properties: { labels: [`retired-${level}`] } };
  const written = await ok(context, origin, 'PATCH', route, writeInput);
  document = await api(route);
  await ok(context, origin, 'POST', `${route}/publish`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId });
  await ok(context, origin, 'POST', `/api/comments/page/${pageId}`, { operationKey: randomUUID(), body: [{ text: `Discussion for ${level} retirement.` }] });
  const before = { document: await api(route), revisions: await api(`/api/revisions/${pageId}`), comments: await api(`/api/comments/page/${pageId}`), grants: await api(`/api/sharing/pages/${pageId}`) };
  assert.equal(before.document.authorMemberId, 'browser-owner');
  assert.equal(before.document.properties.ownerMemberId, 'browser-owner');
  assert.equal((await ok(bob.context, origin, 'GET', route)).permissions.level, level);
  const revisionId = before.document.publishedRevisionId;
  await ok(context, origin, 'POST', `/api/archive/${pageId}`, { operationKey: randomUUID(), expectedRevisionId: before.document.page.revisionId, action: 'trash' });
  await view.goto(`${origin}/app/archive`, { waitUntil: 'networkidle' });
  await view.getByRole('button', { name: 'Trash', exact: true }).click();
  const row = view.locator('.archive-list > li').filter({ has: view.getByRole('heading', { name: title, exact: true }) });
  await expect(row).toHaveCount(1);
  const afterErasure = async () => {
    const activity = []; let cursor;
    do {
      const result = await api('/api/activity?' + new URLSearchParams({ from: before.document.createdAt, limit: '100', ...(cursor ? { cursor } : {}) }));
      activity.push(...result.items); cursor = result.nextCursor;
    } while (cursor);
    return {
      reads: await Promise.all([route, `/api/revisions/${pageId}`, `/api/comments/page/${pageId}`, `/api/sharing/pages/${pageId}`].map(target => call(context, origin, 'GET', target))),
      archive: (await api('/api/archive')).items.filter(item => item.id === pageId),
      activity: activity.filter(item => item.target.id === pageId || item.context?.pageId === pageId),
    };
  };
  const refusal = [];
  if (level === 'full') {
    await row.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    const dialog = view.getByRole('dialog', { name: `Permanently delete ${title}?`, exact: true });
    await dialog.getByRole('checkbox', { name: title, exact: true }).check();
    await dialog.getByRole('textbox', { name: 'Type the page title', exact: true }).fill(title);
    await accessible(view, 'full non-owner confirmed permanent deletion');
    const pending = view.waitForResponse(response => new URL(response.url()).pathname === target && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    const response = await pending;
    assert.equal(response.status(), 200, await response.text());
    const input = response.request().postDataJSON(), result = await response.json();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);
    assert.deepEqual(input.confirmedPageIds, [pageId]);
    assert.deepEqual(result.value.deletedPageIds, [pageId]);
    const after = await afterErasure();
    assert.ok(after.reads.every(item => item.status === 404));
    assert.deepEqual(after.archive, []);
    assert.ok(!JSON.stringify(after.activity).includes(title));
    assert.ok(!JSON.stringify(after.activity).includes(body));
    const erased = after.activity.filter(item => item.operationKey === input.operationKey);
    assert.equal(erased.length, 1);
    assert.deepEqual([erased[0].id, erased[0].actor, erased[0].context, erased[0].deleted, erased[0].occurredAt],
      [result.receipt.activityId, null, {}, true, result.receipt.committedAt],
      'Erasure retains the receipt and time with content-free, anonymized activity.');
    assert.deepEqual((await ok(bob.context, origin, 'POST', target, input)).receipt, result.receipt);
    assert.deepEqual(await afterErasure(), after, 'Repeating erasure cannot repeat activity or restore content.');
    for (const [method, endpoint, input] of [
      ['PATCH', route, writeInput],
      ['POST', '/api/sharing', grantInput],
      ['POST', `/api/revisions/${pageId}/${revisionId}/restore`, { operationKey: randomUUID(), expectedRevisionId: written.receipt.revisionId }],
      ['PATCH', `${route}/blocks/${blockId}`, { operationKey: randomUUID(), expectedRevisionId: before.document.blocks[0].revisionId, content: { text: [{ text: body }] } }],
    ]) {
      const denied = await call(context, origin, method, endpoint, input);
      assert.equal(denied.status, 404);
      assert.equal(denied.body.code, 'NOT_FOUND');
      assert.ok(!JSON.stringify(denied.body).includes(title));
      assert.ok(!JSON.stringify(denied.body).includes(body));
      assert.deepEqual(await afterErasure(), after, 'Old content and grant captures cannot resurrect an erased page.');
      refusal.push({ method, target: endpoint, input, result: denied });
    }
    records.push({ level, erasure: { pageId, before, input, result, after, refusal, grantReceipt: granted.receipt } });
    await accessible(view, 'full non-owner erased page remains absent');
  } else {
    await expect(row.getByRole('button', { name: 'Delete permanently', exact: true })).toHaveCount(0);
    const retained = await afterErasure();
    for (const [method, endpoint, input] of [
      ['GET', `/api/archive/${pageId}/permanent-delete-preview`, undefined],
      ['POST', target, { operationKey: randomUUID(), confirmedPageIds: [pageId] }],
    ]) {
      const denied = await call(bob.context, origin, method, endpoint, input);
      assert.equal(denied.status, 404);
      assert.equal(denied.body.code, 'NOT_FOUND');
      assert.ok(!JSON.stringify(denied.body).includes(title));
      assert.ok(!JSON.stringify(denied.body).includes(body));
      assert.deepEqual(await afterErasure(), retained, 'An under-scoped erasure attempt changes no retained projection or activity.');
      refusal.push({ method, target: endpoint, input, result: denied });
    }
    await accessible(view, `${level} permanent deletion unavailable`);
    await ok(context, origin, 'POST', `/api/archive/${pageId}`, { operationKey: randomUUID(), expectedRevisionId: before.document.page.revisionId, action: 'restore' });
    const restored = { document: await api(route), revisions: await api(`/api/revisions/${pageId}`), comments: await api(`/api/comments/page/${pageId}`), grants: await api(`/api/sharing/pages/${pageId}`) };
    assert.ok(restored.document.updatedAt >= before.document.updatedAt);
    assert.deepEqual({ ...restored, document: { ...restored.document, updatedAt: before.document.updatedAt } }, before,
      'After refused deletion, owner restoration recovers every page, block, version, comment and grant unchanged.');
    records.push({ level, erasure: { pageId, before, retained, refusal, restored } });
  }
  console.log(`PROBE SHARE-002 erasure ${level}: ${level === 'full' ? 'non-owner confirmed deletion and old-capture refusal' : 'preview and delete refused with fresh native proof and exact restored inventory'}`);
}
