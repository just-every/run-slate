import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible, openPageAction } from './browser-support.mjs';
import { call, grant, ok } from './two-people-support.mjs';

/** Exercise public exposure through native controls; only setup uses the API. */
export async function publicPageUnpublishJourney(state) {
  const { page, context, origin, api, readerCookie } = state;
  const width = page.viewportSize().width;
  const directory = path.join(root, '.artifacts/ui-convergence/public-page', String(width));
  await mkdir(directory, { recursive: true });
  const key = () => crypto.randomUUID();
  const workspace = await api('/api/workspace');
  const settings = current => ({
    operationKey: key(), expectedRevisionId: current.revisionId,
    name: current.name, mark: current.mark, description: current.description,
    guestAccess: current.guestAccess, publicLinkAccess: 'allowed', anonymousAccess: 'allowed',
    policies: current.policies,
  });
  await ok(context, origin, 'PUT', '/api/workspace', settings(workspace));
  const space = (await ok(context, origin, 'POST', '/api/containers', {
    operationKey: key(), name: 'Public page journey', visibility: 'private',
  })).value.id;
  const container = await api(`/api/containers/${space}`);
  await ok(context, origin, 'POST', '/api/sharing/container-settings', {
    operationKey: key(), id: space, expectedRevisionId: container.revisionId,
    visibility: 'private', guestAccess: container.guestAccess,
    publicLinkAccess: 'allowed', anonymousAccess: 'allowed',
  });
  const title = 'synthetic-slate-6001';
  const body = 'synthetic-slate-6002';
  const oldTitle = 'synthetic-slate-6003';
  const oldBody = 'synthetic-slate-6004';
  const blockId = key();
  const create = async name => (await ok(context, origin, 'POST', '/api/pages', {
    operationKey: key(), containerId: space, title: name,
    blocks: [{ id: key(), blockType: 'paragraph', content: { text: [{ text: 'synthetic-slate-6005' }] }, treePosition: 'a0' }],
  })).value.pageId;
  const created = await ok(context, origin, 'POST', '/api/pages', {
    operationKey: key(), containerId: space, title: oldTitle,
    blocks: [{ id: blockId, blockType: 'paragraph', content: { text: [{ text: oldBody }] }, treePosition: 'a0' }],
  });
  const id = created.value.pageId;
  const document = () => api(`/api/pages/${id}`);
  const initial = await document();
  await ok(context, origin, 'PATCH', `/api/pages/${id}/blocks/${blockId}`, {
    operationKey: key(), expectedRevisionId: initial.blocks[0].revisionId,
    content: { text: [{ text: body }] },
  });
  await ok(context, origin, 'PATCH', `/api/pages/${id}`, {
    operationKey: key(), expectedRevisionId: (await document()).page.revisionId,
    properties: { title },
  });
  if (!(await document()).publishedRevisionId) await ok(context, origin, 'POST', `/api/pages/${id}/publish`, {
    operationKey: key(), expectedRevisionId: (await document()).page.revisionId,
  });
  await grant(context, origin, id, 'browser-reader', 'view', { expiresAt: '2099-12-31T12:00:00.000Z' });
  const competitor = await create('synthetic-slate-6006');
  const reader = await context.browser().newContext();
  const anonymous = await context.browser().newContext({ viewport: page.viewportSize() });
  await reader.addCookies([{ name: 'slate_session', value: readerCookie.split('=')[1], url: origin }]);
  const anonymousPage = await anonymous.newPage();
  const exposure = pageId => api(`/api/publishing/${pageId}`);
  const versionsAndGrants = async () => {
    const history = await api(`/api/revisions/${id}`);
    return {
      history,
      versions: await Promise.all(history.items.map(item => api(`/api/revisions/${id}/${item.id}`))),
      pageGrants: await api(`/api/sharing/pages/${id}`),
      containerGrants: await api(`/api/sharing/containers/${space}`),
    };
  };
  const publicSettings = async pageId => {
    await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    await openPageAction(page, 'Public access');
    await expect(page.getByRole('heading', { name: 'Public access', exact: true })).toBeVisible();
  };
  const save = async () => {
    const response = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/publishing/${id}`);
    await page.getByRole('dialog', { name: 'Public page settings', exact: true })
      .getByRole('button', { name: 'Save public page', exact: true }).click();
    const committed = await response;
    assert.equal(committed.status(), 200, await committed.text());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    return { input: committed.request().postDataJSON(), receipt: await committed.json() };
  };
  const anonymousRead = async address => {
    // Each read owns a fresh cookie-free transport; no private session or cache.
    const { request } = await import('@playwright/test');
    const transport = await request.newContext();
    try {
      const response = await transport.get(address, { maxRetries: 0 });
      return { status: response.status(), headers: response.headers(), html: await response.text() };
    } finally { await transport.dispose(); }
  };
  const unavailable = response => {
    assert.equal(response.status, 404);
    assert.match(response.html, /This link is no longer available\./);
    for (const marker of [title, body, oldTitle, oldBody]) assert.ok(!response.html.includes(marker), `Unavailable document excludes ${marker}.`);
    assert.ok(response.headers['cache-control'].split(',').map(value => value.trim().toLowerCase()).includes('no-store'), 'Unavailable content cannot be cached.');
    assert.equal(response.headers['set-cookie'], undefined);
  };
  try {
    await publicSettings(id);
    await page.getByRole('button', { name: 'Set up public page', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Public page settings', exact: true });
    await dialog.getByRole('textbox', { name: 'Public address', exact: true }).fill(`synthetic-slate-${id.toLowerCase()}`);
    // Keep the default noindex choice; WEB-005's indexing journey can share this door.
    const published = await save();
    const original = (await exposure(id)).exposure;
    const address = `${origin}/p/${original.slug}`;
    const beforeRead = await anonymousRead(address);
    assert.equal(beforeRead.status, 200);
    assert.ok(beforeRead.html.includes(title) && beforeRead.html.includes(body));
    assert.ok(!beforeRead.html.includes(oldTitle) && !beforeRead.html.includes(oldBody));
    await anonymousPage.goto(address, { waitUntil: 'networkidle' });
    await expect(anonymousPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await accessible(anonymousPage, 'WEB-006 public page before stopping access');
    const before = await versionsAndGrants();
    assert.ok(before.history.items.length >= 3 && before.history.items.every(item => !item.deletedAt));
    assert.ok(before.pageGrants.items.some(item => item.principalId === 'browser-reader' && item.status === 'active'));
    assert.ok(before.containerGrants.items.length > 0);

    await page.getByRole('button', { name: 'Stop public access', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Stop public access?', exact: true });
    await expect(confirmation).toContainText('Workspace access is unchanged.');
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual((await exposure(id)).exposure, original);
    assert.equal((await anonymousRead(address)).status, 200, 'Cancel leaves the public page available.');
    await page.getByRole('button', { name: 'Stop public access', exact: true }).click();
    await accessible(page, 'WEB-006 native stop confirmation');
    const response = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/publishing/${id}`);
    const started = performance.now();
    await confirmation.getByRole('button', { name: 'Stop public access', exact: true }).click();
    const stopped = await response;
    assert.equal(stopped.status(), 200, await stopped.text());
    const refused = await anonymousRead(address);
    const unavailableMs = performance.now() - started;
    unavailable(refused);
    assert.ok(unavailableMs <= 5000, `Anonymous refusal took ${unavailableMs} ms.`);
    await expect(confirmation).not.toBeVisible();
    const revoked = (await exposure(id)).exposure;
    assert.ok(revoked.revokedAt);
    assert.equal(revoked.slug, original.slug);
    assert.deepEqual(await versionsAndGrants(), before, 'Unpublish retains every version body and all direct and inherited grants.');
    assert.equal((await ok(reader, origin, 'GET', `/api/pages/${id}`)).page.title, title, 'Workspace reader access survives unpublish.');
    const unavailableResponse = await anonymousPage.goto(address, { waitUntil: 'networkidle' });
    assert.equal(unavailableResponse.status(), 404);
    await expect(anonymousPage.getByRole('heading', { name: 'This link is no longer available.', exact: true })).toBeVisible();
    await accessible(anonymousPage, 'WEB-006 content-free unavailable page');

    const rivalBefore = await exposure(competitor);
    const rival = await call(context, origin, 'POST', `/api/publishing/${competitor}`, {
      ...published.input, operationKey: key(), expectedRevisionId: (await api(`/api/pages/${competitor}`)).page.revisionId,
    });
    assert.equal(rival.status, 409);
    assert.equal(rival.body.code, 'SLUG_RESERVED');
    assert.deepEqual(await exposure(competitor), rivalBefore, 'Refused slug takeover creates no competing exposure.');
    assert.deepEqual((await exposure(id)).exposure, revoked);
    const replay = await ok(context, origin, 'POST', `/api/publishing/${id}`, published.input);
    assert.deepEqual(replay, published.receipt, 'Retry returns the original receipt.');
    unavailable(await anonymousRead(address));
    const denied = await call(reader, origin, 'POST', `/api/publishing/${id}`, { ...published.input, operationKey: key() });
    assert.equal(denied.status, 403, 'A workspace reader cannot restore public access.');
    assert.deepEqual((await exposure(id)).exposure, revoked, 'Refused publication leaves the exposure revoked.');
    unavailable(await anonymousRead(address));

    await page.reload({ waitUntil: 'networkidle' });
    await openPageAction(page, 'Public access');
    await page.getByRole('button', { name: 'Set up public page', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Public address', exact: true })).toHaveValue(original.slug);
    const republished = await save();
    const restored = (await exposure(id)).exposure;
    assert.equal(restored.revokedAt, null);
    assert.equal(`${origin}/p/${restored.slug}`, address, 'Native republish restores the identical address.');
    assert.deepEqual(await versionsAndGrants(), before, 'Republishing also retains every version and grant.');
    const restoredRead = await anonymousRead(address);
    assert.equal(restoredRead.status, 200);
    assert.ok(restoredRead.html.includes(title) && restoredRead.html.includes(body));
    await anonymousPage.goto(address, { waitUntil: 'networkidle' });
    await expect(anonymousPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await accessible(anonymousPage, 'WEB-006 same public address restored');
    const artifact = JSON.parse(await readFile(path.join(root, '.cache/slate/build-source.json'), 'utf8'));
    await writeFile(path.join(directory, 'unpublish.json'), JSON.stringify({
      artifact, width, address, unavailableMs, published, stopped: await stopped.json(), republished,
      original, revoked, restored, before, after: await versionsAndGrants(),
      anonymous: { before: beforeRead, refused, restored: restoredRead }, rival, denied,
    }, null, 2));
    console.log(`WEB-006 ${width}px: anonymous refusal ${unavailableMs.toFixed(1)} ms; versions and grants unchanged; reserved address restored.`);
  } finally {
    await anonymous.close();
    await reader.close();
    const current = await api('/api/workspace');
    await ok(context, origin, 'PUT', '/api/workspace', {
      ...settings(current), publicLinkAccess: workspace.publicLinkAccess, anonymousAccess: workspace.anonymousAccess,
    });
  }
}
