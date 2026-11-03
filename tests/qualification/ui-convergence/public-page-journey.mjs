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
    console.log('WEB-006 native unpublish response', JSON.stringify({ width: page.viewportSize().width, elapsedMs: unavailableAt - revokedAt }));
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

/** Real site controls and native exposure projections share one publication flow. */
export async function publicPageSettingsJourney({ page, context, origin, api, readerCookie }) {
  const mutate = (route, input) => ok(context, origin, 'POST', route, { operationKey: crypto.randomUUID(), ...input });
  const containerId = (await api('/api/containers')).items.find(item => item.visibility !== 'personal').id;
  const create = async title => {
    const id = (await mutate('/api/pages', { containerId, title })).value.pageId;
    const document = await api(`/api/pages/${id}`);
    if (!document.publishedRevisionId) await mutate(`/api/pages/${id}/publish`, { expectedRevisionId: document.page.revisionId });
    return id;
  };
  const first = await create('Public response handbook');
  const second = await create('Other public handbook');
  const host = new URL(origin).host;
  const initial = { host, slug: 'synthetic-slate-original', indexable: false, theme: 'light', headerControls: ['search'], duplicateAsTemplate: false, socialPreview: { title: 'Response handbook', description: 'Original response guidance' } };
  const edited = { host, slug: 'synthetic-slate-stored-address', indexable: true, theme: 'dark', headerControls: ['breadcrumbs', 'duplicate'], duplicateAsTemplate: true, socialPreview: { title: 'Updated response handbook', description: 'Retained publication settings' } };
  const other = { ...initial, slug: 'synthetic-slate-other', headerControls: ['search', 'duplicate'], duplicateAsTemplate: true };
  const projection = async id => (await api(`/api/publishing/${id}`)).exposure;
  const settings = ({ publishedAt, revokedAt, ...values }) => values;
  const panel = page.locator('.publication-settings');
  const dialog = page.getByRole('dialog', { name: 'Public page settings', exact: true });
  async function showPanel() {
    if (await panel.getByRole('heading', { name: 'Publish to the web', exact: true }).isVisible()) return;
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Public access', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Publish to the web', exact: true })).toBeVisible();
  }
  async function open(id) {
    await page.goto(`${origin}/app/pages/${id}`, { waitUntil: 'networkidle' });
    await showPanel();
  }
  async function edit(values) {
    await panel.getByRole('button', { name: /^(Set up public page|Edit public settings)$/ }).click();
    await dialog.getByRole('textbox', { name: 'Host', exact: true }).fill(values.host);
    await dialog.getByRole('textbox', { name: 'Public address', exact: true }).fill(values.slug);
    await dialog.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(values.theme);
    await dialog.getByRole('checkbox', { name: 'Allow search engines to index this page', exact: true }).setChecked(values.indexable);
    await dialog.getByRole('checkbox', { name: 'Allow readers to duplicate the published page', exact: true }).setChecked(values.duplicateAsTemplate);
    for (const control of ['search', 'breadcrumbs', 'duplicate']) await dialog.locator(`input[name="header"][value="${control}"]`).setChecked(values.headerControls.includes(control));
    await dialog.getByRole('textbox', { name: 'Social preview title', exact: true }).fill(values.socialPreview.title);
    await dialog.getByRole('textbox', { name: 'Social preview description', exact: true }).fill(values.socialPreview.description);
  }
  async function save(id, status = 200) {
    const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/publishing/${id}`);
    await dialog.getByRole('button', { name: 'Save public page', exact: true }).click();
    const receipt = await response;
    assert.equal(receipt.status(), status, await receipt.text());
    if (status === 200) {
      const body = await receipt.json();
      assert.equal(body.value.pageId, id);
      assert.equal(body.receipt.operationKey, receipt.request().postDataJSON().operationKey);
      await expect(dialog).not.toBeVisible();
    } else assert.equal((await receipt.json()).code, 'SLUG_RESERVED');
  }
  async function inspect(id, expected, label) {
    await open(id);
    await page.reload({ waitUntil: 'networkidle' });
    await showPanel();
    const stored = await projection(id);
    assert.deepEqual(settings(stored), expected, 'Every exposure field matches the submitted settings after reload.');
    assert.equal(stored.revokedAt, null);
    assert.ok(Number.isFinite(Date.parse(stored.publishedAt)));
    await panel.getByRole('button', { name: 'Edit public settings', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Host', exact: true })).toHaveValue(expected.host);
    await expect(dialog.getByRole('textbox', { name: 'Public address', exact: true })).toHaveValue(expected.slug);
    await expect(dialog.getByRole('combobox', { name: 'Theme', exact: true })).toHaveValue(expected.theme);
    assert.equal(await dialog.getByRole('checkbox', { name: 'Allow search engines to index this page', exact: true }).isChecked(), expected.indexable);
    assert.equal(await dialog.getByRole('checkbox', { name: 'Allow readers to duplicate the published page', exact: true }).isChecked(), expected.duplicateAsTemplate);
    for (const control of ['search', 'breadcrumbs', 'duplicate']) assert.equal(await dialog.locator(`input[name="header"][value="${control}"]`).isChecked(), expected.headerControls.includes(control));
    await expect(dialog.getByRole('textbox', { name: 'Social preview title', exact: true })).toHaveValue(expected.socialPreview.title);
    await expect(dialog.getByRole('textbox', { name: 'Social preview description', exact: true })).toHaveValue(expected.socialPreview.description);
    if (label) {
      const close = dialog.getByRole('button', { name: 'Close dialog', exact: true });
      await page.keyboard.press('Tab');await close.focus();
      assert.equal(await close.evaluate(element => getComputedStyle(element, '::after').opacity), '1', 'Keyboard focus shows the close tooltip immediately.');
      await dialog.getByRole('textbox', { name: 'Host', exact: true }).focus();
      await page.mouse.move(0, 0);await close.hover();
      await expect.poll(() => close.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
      await accessible(page, label);
    }
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    return stored;
  }
  await open(first); await edit(initial); await save(first); await inspect(first, initial);
  await edit(edited); await save(first); await inspect(first, edited, 'stored public page settings');
  await page.getByRole('button', { name: 'Close details ×', exact: true }).click();
  await page.getByRole('textbox', { name: 'Page title', exact: true }).fill('Renamed independently of its address');
  await page.getByRole('textbox', { name: 'Page title', exact: true }).blur();
  await expect.poll(async () => (await api(`/api/pages/${first}`)).page.title).toBe('Renamed independently of its address');
  await inspect(first, edited);
  assert.equal((await context.request.get(`${origin}/p/${edited.slug}`)).status(), 200);
  await open(second);await edit(other);await save(second);
  const activeCollision = [await projection(first), await projection(second)];
  await edit({ ...other, slug: edited.slug });await save(second, 409);
  await expect(dialog.getByRole('alert')).toContainText('This address is already reserved.');
  assert.deepEqual([await projection(first), await projection(second)], activeCollision, 'An active address collision changes neither exposure.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await open(first);
  const beforeRevoke = Date.now();
  await panel.getByRole('button', { name: 'Stop public access', exact: true }).click();
  await page.getByRole('dialog', { name: 'Stop public access?', exact: true }).getByRole('button', { name: 'Stop public access', exact: true }).click();
  await expect.poll(async () => (await projection(first)).revokedAt).not.toBeNull();
  const revoked = await projection(first);
  assert.deepEqual(settings(revoked), edited);
  assert.ok(Date.parse(revoked.revokedAt) >= beforeRevoke && Date.parse(revoked.revokedAt) <= Date.now());
  await open(first); await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual(await projection(first), revoked, 'Reload retains the exact revocation time and every setting.');
  assert.equal((await context.request.get(`${origin}/p/${edited.slug}`)).status(), 404);
  await open(second);
  const beforeCollision = [await projection(first), await projection(second)];
  await edit({ ...other, slug: edited.slug }); await save(second, 409);
  await expect(dialog.getByRole('alert')).toContainText('This address is already reserved.');
  assert.deepEqual([await projection(first), await projection(second)], beforeCollision, 'A reserved slug changes neither exposure, even while its owner is revoked.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await inspect(second, other);
  const reader = await context.browser().newContext();
  try {
    await reader.addCookies([{ name: 'slate_session', value: readerCookie.split('=')[1], url: origin }]);
    const beforeDenied = [await projection(first), await projection(second)];
    const refused = await call(reader, origin, 'POST', `/api/publishing/${first}`, { ...edited, operationKey: crypto.randomUUID(), expectedRevisionId: (await api(`/api/pages/${first}`)).page.revisionId });
    assert.equal(refused.status, 404);
    assert.deepEqual([await projection(first), await projection(second)], beforeDenied, 'A member without full access cannot reactivate or alter an exposure.');
  } finally { await reader.close(); }
  console.log('PROBE WEB-002 settings: native site create, edit, reload and rename -> exact stored exposure retained');
  console.log('PROBE WEB-002 revocation and collision: native stop and second-page save -> retained revocation time; 409 with both records unchanged');
}

/** An empty visitor context reads the exact published revision without workspace data or tracking. */
export async function anonymousPublicPageJourney({ page, context, origin, api, readerCookie }) {
  const workspace = await api('/api/workspace');
  const profile = async lifecycle => {
    const current = await api('/api/workspace');
    const { name, mark, description, guestAccess, publicLinkAccess, anonymousAccess } = current;
    await ok(context, origin, 'PUT', '/api/workspace', { operationKey: crypto.randomUUID(), expectedRevisionId: current.revisionId,
      name, mark, description, guestAccess, publicLinkAccess, anonymousAccess,
      policies: { ...workspace.policies, 'page.lifecycle.v1': lifecycle } });
  };
  const mutate = (route, input, method = 'POST') => ok(context, origin, method, route, { operationKey: crypto.randomUUID(), ...input });
  const visitor = await context.browser().newContext({ viewport: page.viewportSize() });
  const reader = await context.browser().newContext();
  try {
    await profile('draft-then-publish');
    const containerId = (await mutate('/api/containers', { name: 'Public reading proof', visibility: 'private' })).value.id;
    const create = async (title, blocks = []) => (await mutate('/api/pages', { containerId, title, blocks })).value.pageId;
    const reference = await create('Published visitor reference');
    const hidden = await create('Private unpublished visitor reference');
    const blockId = crypto.randomUUID();
    const id = await create('Published visitor handbook', [
      { id: blockId, blockType: 'paragraph', treePosition: 'a', content: { text: [{ text: 'Published visitor guidance' }] } },
      { id: crypto.randomUUID(), blockType: 'paragraph', treePosition: 'b', content: { text: [
        { text: 'Read public reference', link: { href: `/app/pages/${reference}` } },
        { text: ' and private reference', link: { href: `/app/pages/${hidden}` } },
      ] } },
    ]);
    const publish = async (pageId, slug) => {
      await mutate(`/api/pages/${pageId}/publish`, { expectedRevisionId: (await api(`/api/pages/${pageId}`)).page.revisionId });
      const input = { operationKey: crypto.randomUUID(), expectedRevisionId: (await api(`/api/pages/${pageId}`)).page.revisionId,
        host: new URL(origin).host, slug, theme: 'light', headerControls: [], duplicateAsTemplate: false, indexable: false };
      await ok(context, origin, 'POST', `/api/publishing/${pageId}`, input);
      return input;
    };
    await publish(reference, 'synthetic-slate-visitor-reference');
    const exposureInput = await publish(id, 'synthetic-slate-visitor-handbook');
    const published = await api(`/api/pages/${id}`);
    await mutate('/api/sharing', { targetKind: 'page', targetId: id, principalKind: 'member', principalId: 'browser-reader', level: 'comment' });
    await reader.addCookies([{ name: 'slate_session', value: readerCookie.split('=')[1], url: origin }]);
    await ok(reader, origin, 'POST', `/api/comments/page/${id}`, { operationKey: crypto.randomUUID(), body: [{ text: 'Private reviewer discussion' }] });
    await mutate(`/api/pages/${id}`, { expectedRevisionId: published.page.revisionId, properties: { title: 'Private working visitor title' } }, 'PATCH');
    const working = await api(`/api/pages/${id}`);
    await mutate(`/api/pages/${id}/blocks/${blockId}`, { expectedRevisionId: working.blocks.find(block => block.id === blockId).revisionId,
      content: { text: [{ text: 'Private working visitor body' }] } }, 'PATCH');
    const draft = await api(`/api/pages/${id}`);
    assert.equal(draft.publishedRevisionId, published.publishedRevisionId);
    assert.notEqual(draft.workingRevisionId, draft.publishedRevisionId);
    const baseline = await api(`/api/analytics?pageId=${id}`);
    const requests = [];
    visitor.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData(), headers: request.headers() }));
    const view = await visitor.newPage();
    assert.deepEqual(await visitor.cookies(), []);
    const response = await view.goto(`${origin}/p/${exposureInput.slug}`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['set-cookie'], undefined);
    await expect(view.getByRole('heading', { name: 'Published visitor handbook', exact: true })).toBeVisible();
    await expect(view.locator('.page-body')).toContainText('Published visitor guidance');
    const body = await view.locator('body').innerText();
    for (const privateValue of ['Private working visitor title', 'Private working visitor body', 'Private reviewer discussion', 'Morgan Reader', 'Private unpublished visitor reference']) assert.ok(!body.includes(privateValue), `The anonymous document excludes ${privateValue}.`);
    if (published.properties.byline) await expect(view.locator('.page-byline')).toHaveText(published.properties.byline);
    await expect(view.locator('[contenteditable], textarea, [data-page-editor], .app-navigation, .page-topbar, .comment-thread')).toHaveCount(0);
    await expect(view.getByRole('navigation', { name: /Workspace|Main/ })).toHaveCount(0);
    await expect(view.getByRole('link', { name: 'Read public reference', exact: true })).toHaveAttribute('href', '/p/synthetic-slate-visitor-reference');
    await expect(view.locator(`a[href*="${hidden}"]`)).toHaveCount(0);
    await expect(view.locator('a[href^="/app/"]')).toHaveCount(0);
    await expect(view.locator('.page-body')).toContainText('and private reference');
    assert.deepEqual(await visitor.cookies(), []);
    assert.deepEqual(await view.evaluate(() => ({ cookie: document.cookie, local: localStorage.length, session: sessionStorage.length })), { cookie: '', local: 0, session: 0 });
    assert.ok(requests.length > 0);
    for (const request of requests) {
      assert.equal(new URL(request.url).origin, origin, 'No third-party resource or visitor-data request is made before interaction.');
      assert.equal(new URL(request.url).search, '');
      assert.equal(request.method, 'GET');assert.equal(request.body, null);
      assert.equal(request.headers.cookie, undefined);assert.equal(request.headers.authorization, undefined);
    }
    const counted = await api(`/api/analytics?pageId=${id}`);
    assert.equal(counted.anonymousViews, baseline.anonymousViews + 1);
    assert.equal(counted.totalViews, baseline.totalViews + 1);
    assert.equal(counted.uniqueViewers, baseline.uniqueViewers);
    assert.deepEqual(counted.viewers, baseline.viewers, 'Counting an anonymous visit creates no identified viewer.');
    await accessible(view, 'anonymous published revision without private workspace data');
    await view.getByRole('link', { name: 'Read public reference', exact: true }).click();
    await expect(view.getByRole('heading', { name: 'Published visitor reference', exact: true })).toBeVisible();
    const denied = await visitor.request.get(`${origin}/api/pages/${id}`);
    assert.equal(denied.status(), 401);
    assert.ok(!(await denied.text()).includes('Private working visitor'));
    const current = await api(`/api/pages/${id}`);
    await mutate(`/api/publishing/${id}`, { ...exposureInput, operationKey: crypto.randomUUID(), expectedRevisionId: current.page.revisionId, revoke: true });
    await ok(context, origin, 'POST', `/api/publishing/${id}`, exposureInput);
    const stopped = await view.goto(`${origin}/p/${exposureInput.slug}`, { waitUntil: 'networkidle' });
    assert.equal(stopped.status(), 404);
    await expect(view.locator('body')).not.toContainText('Published visitor handbook');
    await expect(view.locator('body')).not.toContainText('Published visitor guidance');
    console.log('PROBE WEB-003 published read: anonymous built page -> exact published title and body, public reference only, no workspace controls, comments or private names');
    console.log('PROBE WEB-003 privacy: fresh visitor before interaction -> same-origin GETs, zero cookies or browser storage, one anonymous view and no identified viewer; private API and revoked replay refused');
  } finally {
    await visitor.close();await reader.close();
    await profile(workspace.policies['page.lifecycle.v1'] ?? 'always-live');
  }
}
