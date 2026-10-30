import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';
import { call, ok } from './two-people-support.mjs';

/** Native publication controls and the first anonymous document after each commit. */
export async function publicPageJourney(state, sourcePageId) {
  const { page, context, origin, api } = state;
  const source = await api(`/api/pages/${sourcePageId}`);
  // Explicit public-access preconditions preserve all unrelated workspace settings.
  const workspace = await api('/api/workspace');
  const { name, mark, description, guestAccess, policies } = workspace;
  await ok(context, origin, 'PUT', '/api/workspace', {
    operationKey: crypto.randomUUID(), expectedRevisionId: workspace.revisionId,
    name, mark, description, guestAccess, policies,
    publicLinkAccess: 'allowed', anonymousAccess: 'allowed',
  });
  const container = await api(`/api/containers/${source.page.containerId}`);
  await ok(context, origin, 'POST', '/api/sharing/container-settings', {
    operationKey: crypto.randomUUID(), id: container.id, expectedRevisionId: container.revisionId,
    visibility: container.visibility, guestAccess: container.guestAccess,
    publicLinkAccess: 'allowed', anonymousAccess: 'allowed',
  });
  const created = (await ok(context, origin, 'POST', '/api/pages', {
    operationKey: crypto.randomUUID(), containerId: container.id,
    title: 'Public indexing guide',
    blocks: [{ id: crypto.randomUUID(), blockType: 'paragraph', treePosition: '1',
      content: { text: [{ text: 'Choose whether crawlers can index this public guide.' }] } }],
  })).value;
  const id = created.pageId;
  const document = await api(`/api/pages/${id}`);
  assert.ok(document.permissions.canShare, 'The publisher has full page access.');
  assert.ok(document.publishedRevisionId, 'A workspace revision is published before anonymous exposure.');
  assert.equal((await api(`/api/publishing/${id}`)).exposure, null);
  const slug = `synthetic-slate-${id}`;
  const url = `${origin}/p/${slug}`;
  const anonymous = await context.browser().newContext({ viewport: page.viewportSize() });
  const reader = await context.browser().newContext();
  await reader.addCookies([{ name: 'slate_session', value: state.readerCookie.split('=')[1], url: origin }]);
  const publicPage = await anonymous.newPage();
  try {
    const openSettings = async (initial = false) => {
      await page.goto(`${origin}/app/pages/${id}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Public access', exact: true }).click();
      await page.getByRole('button', { name: initial ? 'Set up public page' : 'Edit public settings', exact: true }).click();
      return page.getByRole('dialog', { name: 'Public page settings', exact: true });
    };
    const save = async dialog => {
      const committed = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === `/api/publishing/${id}`);
      await dialog.getByRole('button', { name: 'Save public page', exact: true }).click();
      const response = await committed;
      assert.equal(response.status(), 200, await response.text());
      await expect(dialog).not.toBeVisible();
      return response.request().postDataJSON();
    };
    // No poll, cache buster or earlier anonymous read may mask the first response.
    const firstDocument = async (indexable, label, available = true) => {
      const response = await publicPage.goto(url, { waitUntil: 'networkidle' });
      const receivedAt = Date.now();
      assert.equal(response.status(), available ? 200 : 404);
      assert.equal(await response.request().headerValue('cookie'), null);
      const robots = indexable ? 'index,follow' : 'noindex,nofollow';
      assert.equal(response.headers()['x-robots-tag'], robots, `${label}: response directive`);
      assert.ok(response.headers()['cache-control'].split(',').map(value => value.trim()).includes('no-store'));
      await expect(publicPage.locator('meta[name="robots"]')).toHaveCount(1);
      await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute('content', robots);
      if (available) {
        await expect(publicPage.getByRole('heading', { name: 'Public indexing guide', exact: true })).toBeVisible();
        await expect(publicPage.getByRole('main')).toContainText('Choose whether crawlers can index this public guide.');
      } else {
        await expect(publicPage.getByRole('heading', { name: 'This link is no longer available.', exact: true })).toBeVisible();
        await expect(publicPage.locator('body')).not.toContainText('Public indexing guide');
        await expect(publicPage.locator('body')).not.toContainText('Choose whether crawlers can index this public guide.');
      }
      assert.deepEqual(await anonymous.cookies(), [], 'Anonymous publication creates no session.');
      await accessible(publicPage, `public page ${label}`);
      return receivedAt;
    };
    let dialog = await openSettings(true);
    await dialog.getByRole('textbox', { name: 'Public address', exact: true }).fill(slug);
    const indexing = () => dialog.getByRole('checkbox', { name: 'Allow search engines to index this page', exact: true });
    await expect(indexing()).not.toBeChecked();
    await accessible(page, 'new public page settings');
    assert.equal((await save(dialog)).indexable, false, 'Publishing without selecting indexing submits false.');
    await firstDocument(false, 'default noindex');
    assert.equal((await api(`/api/publishing/${id}`)).exposure.indexable, false);

    // A reader cannot change publication settings, and the refused write changes nothing.
    await ok(context, origin, 'POST', '/api/sharing', {
      operationKey: crypto.randomUUID(), targetKind: 'page', targetId: id,
      principalKind: 'member', principalId: 'browser-reader', level: 'view',
    });
    const readable = await call(reader, origin, 'GET', `/api/pages/${id}`);
    assert.equal(readable.status, 200);
    assert.equal(readable.body.permissions.level, 'view');
    const beforeRefusal = (await api(`/api/publishing/${id}`)).exposure;
    for (const action of [{ indexable: true }, { revoke: true }]) {
      const refused = await call(reader, origin, 'POST', `/api/publishing/${id}`, {
        operationKey: crypto.randomUUID(), expectedRevisionId: document.page.revisionId,
        host: new URL(origin).host, slug, ...action,
      });
      assert.equal(refused.status, 404);
      assert.equal(refused.body.code, 'NOT_FOUND');
      assert.deepEqual((await api(`/api/publishing/${id}`)).exposure, beforeRefusal);
    }

    dialog = await openSettings();
    await expect(indexing()).not.toBeChecked();
    await indexing().check();
    const enabled = await save(dialog);
    assert.equal(enabled.indexable, true);
    await firstDocument(true, 'indexing enabled');
    assert.equal((await api(`/api/publishing/${id}`)).exposure.indexable, true);

    dialog = await openSettings();
    await expect(indexing()).toBeChecked();
    await indexing().uncheck();
    await accessible(page, 'public page indexing disabled');
    assert.equal((await save(dialog)).indexable, false);
    await firstDocument(false, 'indexing disabled');
    assert.equal((await api(`/api/publishing/${id}`)).exposure.indexable, false);
    dialog = await openSettings();
    await expect(indexing()).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

    const versions = await api(`/api/revisions/${id}`);
    const grants = await api(`/api/sharing/pages/${id}`);
    await page.getByRole('button', { name: 'Stop public access', exact: true }).click();
    const stopDialog = page.getByRole('dialog', { name: 'Stop public access?', exact: true });
    const stopped = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/publishing/${id}`);
    await stopDialog.getByRole('button', { name: 'Stop public access', exact: true }).click();
    const stoppedResponse = await stopped;
    assert.equal(stoppedResponse.status(), 200, await stoppedResponse.text());
    const revokedAt = Date.now();
    await expect(stopDialog).not.toBeVisible();
    const unavailableAt = await firstDocument(false, 'unpublished', false);
    assert.ok(unavailableAt - revokedAt < 5000, 'The first anonymous request is content-free within five seconds.');
    assert.ok((await api(`/api/publishing/${id}`)).exposure.revokedAt);
    assert.deepEqual(await api(`/api/revisions/${id}`), versions, 'Unpublish deletes no version.');
    assert.deepEqual(await api(`/api/sharing/pages/${id}`), grants, 'Unpublish changes no grant.');
    const collision = (await ok(context, origin, 'POST', '/api/pages', {
      operationKey: crypto.randomUUID(), containerId: container.id, title: 'Separate public guide',
    })).value;
    const refused = await call(context, origin, 'POST', `/api/publishing/${collision.pageId}`, {
      operationKey: crypto.randomUUID(), expectedRevisionId: collision.revisionId,
      host: new URL(origin).host, slug,
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'SLUG_RESERVED');
    dialog = await openSettings(true);
    await expect(dialog.getByRole('textbox', { name: 'Public address', exact: true })).toHaveValue(slug);
    await save(dialog);
    await firstDocument(false, 'republished at reserved address');
    const exposure = (await api(`/api/publishing/${id}`)).exposure;
    assert.equal(exposure.slug, slug);
    assert.equal(exposure.revokedAt, null);
    assert.deepEqual(await api(`/api/revisions/${id}`), versions);
    assert.deepEqual(await api(`/api/sharing/pages/${id}`), grants);
    // Replaying a prior indexing choice after revocation cannot reopen the public address.
    await page.getByRole('button', { name: 'Stop public access', exact: true }).click();
    const finalStop = page.getByRole('dialog', { name: 'Stop public access?', exact: true });
    await finalStop.getByRole('button', { name: 'Stop public access', exact: true }).click();
    await expect(finalStop).not.toBeVisible();
    await ok(context, origin, 'POST', `/api/publishing/${id}`, enabled);
    await firstDocument(false, 'revoked publication replay', false);
    assert.ok((await api(`/api/publishing/${id}`)).exposure.revokedAt);
  } finally {
    await anonymous.close();
    await reader.close();
  }
}
