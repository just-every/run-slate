import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { accessible } from './browser-evidence.mjs';
import { call, caretAtEnd, editable, elapsedUntil, grant, ok, restrictedPage } from './two-people-support.mjs';

/** The owner changes Bob's access through the Share panel's own controls. */
async function bobGrantControls(alice, pageId, origin) {
  if (!new URL(alice.page.url()).pathname.endsWith(pageId)) await alice.page.goto(`${origin}/app/pages/${pageId}?detail=share`, { waitUntil: 'networkidle' });
  else if (!(await alice.page.locator('.right').getByRole('heading', { name: 'Share this page' }).isVisible())) await alice.page.goto(`${origin}/app/pages/${pageId}?detail=share`, { waitUntil: 'networkidle' });
  const advanced = alice.page.locator('.right .advanced-access');
  if ((await advanced.getAttribute('open')) === null) await advanced.locator('summary').first().click();
  return alice.page.locator('.grant-list > li').filter({ has: alice.page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true }) });
}

/**
 * LINK-004: a page Bob can read mentions the supplier page, in its body and in a
 * comment. Every door that hands Bob that content names the mentioned page only
 * while Bob may open it. Returns what each door showed him.
 */
async function mentionDoors(alice, bob, origin, index, title) {
  const doors = {};
  const document = await ok(bob.context, origin, 'GET', `/api/pages/${index.pageId}`);
  doors.page = JSON.stringify(document);
  doors.revision = JSON.stringify(await ok(bob.context, origin, 'GET', `/api/revisions/${index.pageId}/${document.publishedRevisionId ?? document.workingRevisionId}`));
  doors.comments = JSON.stringify(await ok(bob.context, origin, 'GET', `/api/comments/page/${index.pageId}`));
  doors.search = JSON.stringify(await ok(bob.context, origin, 'GET', `/api/search?q=${encodeURIComponent(title)}`));
  doors.inbox = JSON.stringify(await ok(bob.context, origin, 'GET', '/api/notifications'));
  const exported = await bob.context.request.post(`${origin}/api/exports/readable`, { headers: { origin, 'content-type': 'application/json' }, data: JSON.stringify({ scope: 'page', id: index.pageId, format: 'markdown' }) });
  assert.equal(exported.status(), 200);
  doors.export = Object.values(unzipSync(new Uint8Array(await exported.body()))).map(entry => strFromU8(entry)).join('\n');
  if (index.publicPath) {
    const anonymous = await alice.context.browser().newContext();
    doors.public = await (await anonymous.request.get(`${origin}${index.publicPath}`)).text();
    await anonymous.close();
  }
  return { doors, mention: document.mentions[index.target] };
}

/**
 * SHARE-007, SHARE-008, LINK-004 and REV-005: Bob has the page open with unsaved
 * typing when the owner removes, narrows or lets his access expire.
 */
export async function accessChangeJourney(state, people, width) {
  const { alice, bob, record, shot } = people, { origin } = state;
  const tag = randomBytes(4).toString('hex');
  const marker = `access${tag}`;
  const { pageId, blockIds: [first] } = await restrictedPage({ context: alice.context, origin }, `Supplier contacts ${tag}`, [`Escalation contacts ${marker}.`, 'Second line.']);
  // Negative control: Bob's unchanged grant on another page keeps working throughout.
  const control = await restrictedPage({ context: alice.context, origin }, `Control page ${tag}`, ['Control line.']);
  await grant(alice.context, origin, control.pageId, bob.id, 'edit');
  const bobApi = (method, route, data) => call(bob.context, origin, method, route, data);
  const bobSees = {
    page: async () => (await bobApi('GET', `/api/pages/${pageId}`)).status === 200,
    tree: async () => JSON.stringify((await bobApi('GET', '/api/pages')).body).includes(pageId),
    search: async () => JSON.stringify((await bobApi('GET', `/api/search?q=${marker}`)).body).includes(pageId),
    inbox: async () => JSON.stringify((await bobApi('GET', '/api/notifications')).body).includes(pageId),
  };
  const controlStillWorks = async () => {
    const document = (await bobApi('GET', `/api/pages/${control.pageId}`));
    assert.equal(document.status, 200, 'An unchanged grant keeps working.');
    const block = document.body.blocks[0];
    const edit = await bobApi('PATCH', `/api/pages/${control.pageId}/blocks/${block.id}`, { operationKey: randomUUID(), expectedRevisionId: block.revisionId, content: { text: [{ text: `Control line edited ${randomUUID().slice(0, 6)}.` }] } });
    assert.equal(edit.status, 200, 'An unchanged edit grant still saves.');
  };
  const results = {};
  // A readable index page mentions the supplier page in its body and in a comment.
  const title = `Supplier contacts ${tag}`;
  const index = await restrictedPage({ context: alice.context, origin }, `Index ${tag}`, ['See below.']);
  await grant(alice.context, origin, index.pageId, bob.id, 'view');
  const mentioning = [{ text: 'See ' }, { text: title, mention: { kind: 'page', id: pageId, label: title } }, { text: ' for details.' }];
  const indexBlock = (await ok(alice.context, origin, 'GET', `/api/pages/${index.pageId}`)).blocks[0];
  await ok(alice.context, origin, 'PATCH', `/api/pages/${index.pageId}/blocks/${indexBlock.id}`, { operationKey: randomUUID(), expectedRevisionId: indexBlock.revisionId, content: { text: mentioning } });
  await ok(alice.context, origin, 'POST', `/api/comments/page/${index.pageId}`, { operationKey: randomUUID(), kind: 'page', body: mentioning });
  const indexNow = await ok(alice.context, origin, 'GET', `/api/pages/${index.pageId}`);
  const published = await call(alice.context, origin, 'POST', `/api/publishing/${index.pageId}`, { operationKey: randomUUID(), expectedRevisionId: indexNow.page.revisionId, host: new URL(origin).host, slug: `index-${tag}`, indexable: false, theme: 'default', headerControls: [], duplicateAsTemplate: false, socialPreview: {}, revoke: false });
  Object.assign(index, { target: pageId, publicPath: published.status === 200 ? `/p/index-${tag}` : null });
  const mentionResults = {};
  const mentionsShown = async (name, visible) => {
    const { doors, mention } = await mentionDoors(alice, bob, origin, index, title);
    for (const [door, body] of Object.entries(doors)) if (!['search', 'public', 'inbox'].includes(door)) assert.equal(body.includes(title), visible, `${name}: the ${door} door ${visible ? 'names' : 'does not name'} the mentioned page.`);
    if (!visible) assert.ok(!doors.inbox.includes(title), `${name}: the inbox does not name the mentioned page.`);
    // The supplier page is never public, and the shared search index never holds a mention's title.
    if (doors.public !== undefined) assert.ok(!doors.public.includes(title) && doors.public.includes('Restricted page'), `${name}: the public page does not name a private page.`);
    assert.equal(JSON.parse(doors.search).items.some(item => item.id === index.pageId), false, `${name}: the index page is not found by the mentioned page's title.`);
    assert.equal(JSON.parse(doors.search).items.some(item => item.id === pageId), visible, `${name}: search finds the supplier page only while Bob may open it.`);
    assert.equal(mention.label, visible ? title : 'Restricted page');
    if (!visible) assert.ok(doors.page.includes('Restricted page') && doors.export.includes('Restricted page'), `${name}: the mention reads Restricted page.`);
    mentionResults[name] = { visible, label: mention.label, doors: Object.keys(doors) };
  };
  // Alice may open the supplier page, so her own copy names it.
  assert.ok(JSON.stringify(await ok(alice.context, origin, 'GET', `/api/pages/${index.pageId}`)).includes(title), 'The owner sees the mentioned title.');

  const scenario = async (name, change, expectState) => {
    // Bob opens the page with edit access, keeps a link to its current revision, and types without saving.
    const document = await ok(bob.context, origin, 'GET', `/api/pages/${pageId}`);
    assert.equal(document.permissions.canEdit, true);
    const revisionLink = `${origin}/app/pages/${pageId}?detail=history&revision=${document.workingRevisionId}`;
    await bob.page.goto(revisionLink, { waitUntil: 'networkidle' });
    await expect(bob.page.locator('.revision-preview')).toContainText(marker);
    await bob.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    for (const [where, check] of Object.entries(bobSees)) assert.ok(await check(), `Before the change Bob finds the page in ${where}.`);
    if (width === 1440) await expect(bob.page.locator(`aside.sidebar a[href="/app/pages/${pageId}"]`).first()).toBeVisible();
    const unsent = ` Unsent ${name} ${tag}`, typed = [];
    await caretAtEnd(bob.page, first);
    // Bob keeps writing, never pausing long enough to save, until his editor stops taking text.
    let stop = false;
    const typing = (async () => {
      for (const key of unsent.repeat(4)) {
        if (stop || !(await editable(bob.page, first).count())) break;
        await bob.page.keyboard.type(key);
        typed.push(key);
        await bob.page.waitForTimeout(200);
      }
    })();
    await bob.page.waitForTimeout(1500);
    const changedAt = await change();
    // The next request from Bob's existing session is refused.
    const refused = await bobApi('PATCH', `/api/pages/${pageId}/blocks/${first}`, { operationKey: randomUUID(), expectedRevisionId: document.blocks[0].revisionId, content: { text: [{ text: 'Should never save.' }] } });
    assert.ok([403, 404].includes(refused.status), `${name}: Bob's next write is refused (${refused.status}).`);
    const measured = { nextRequestRefused: refused.status };
    if (expectState === 'closed') {
      // Bob's own session, asked straight away, no longer finds the page anywhere.
      for (const where of ['page', 'tree', 'search', 'inbox']) measured[`${where}GoneMs`] = await elapsedUntil(async () => !(await bobSees[where]()), { timeout: 5000, since: changedAt });
      measured.editorClosedMs = await elapsedUntil(() => bob.page.getByRole('heading', { name: 'Access needed', exact: true }).isVisible(), { timeout: 5000, since: changedAt });
      await expect(bob.page.locator('.request-notice')).toContainText('Your access to this page changed while it was open.');
      if (width === 1440) measured.sidebarTreeGoneMs = await elapsedUntil(async () => (await bob.page.locator(`aside.sidebar a[href="/app/pages/${pageId}"]`).count()) === 0, { timeout: 5000, since: changedAt });
    } else {
      measured.editorReadOnlyMs = await elapsedUntil(async () => (await bob.page.locator(`[data-block-id="${first}"] [contenteditable="true"]`).count()) === 0 && await bob.page.getByText('This page is read-only with your current access.').isVisible(), { timeout: 5000, since: changedAt });
      for (const where of ['page', 'tree', 'search']) assert.ok(await bobSees[where](), `${name}: a viewer still reads and finds the page (${where}).`);
    }
    stop = true;
    await typing;
    // Bob's unsaved text stays his: shown to him as an unsaved draft, nowhere in the workspace.
    const draft = bob.page.getByRole('region', { name: 'Your unsaved text' });
    await expect(draft).toContainText(typed.join('').trim());
    await expect(draft).toContainText('It was not saved to the workspace');
    const server = await ok(alice.context, origin, 'GET', `/api/pages/${pageId}`);
    assert.ok(!JSON.stringify(server.blocks).includes(`Unsent ${name}`), `${name}: the unsaved text is not on the page.`);
    assert.ok(!JSON.stringify(await ok(alice.context, origin, 'GET', `/api/search?q=${encodeURIComponent(`Unsent ${name}`)}`)).includes(pageId));
    await shot('bob', `${name} editor after access change`);
    await accessible(bob.page, `${name} access change keeps draft`);
    await draft.getByRole('button', { name: 'Copy text', exact: true }).click();
    await expect(draft.getByRole('status')).toHaveText('Copied');
    assert.ok((await bob.page.evaluate(() => navigator.clipboard.readText())).includes(typed.join('').trim()), `${name}: Bob can copy his unsaved text.`);
    await draft.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(draft).toHaveCount(0);
    if (expectState === 'closed') {
      // LINK-004: the direct URL says access is needed with no title, snippet or author.
      await bob.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
      await expect(bob.page.getByRole('heading', { name: 'Access needed', exact: true })).toBeVisible();
      const main = await bob.page.locator('.content-frame').innerText();
      for (const leaked of [`Supplier contacts ${tag}`, marker, 'Alex Owner']) assert.ok(!main.includes(leaked), `${name}: the access-needed state shows no ${leaked}.`);
      await expect(bob.page.getByRole('button', { name: 'Request access', exact: true })).toBeVisible();
      // REV-005: Bob's earlier revision link gives no content today.
      await bob.page.goto(revisionLink, { waitUntil: 'networkidle' });
      await expect(bob.page.getByRole('heading', { name: 'Access needed', exact: true })).toBeVisible();
      assert.ok(!(await bob.page.locator('body').innerText()).includes(marker), `${name}: an old revision link opens no historical content.`);
      assert.ok([403, 404].includes((await bobApi('GET', `/api/revisions/${pageId}/${document.workingRevisionId}`)).status));
      await shot('bob', `${name} revision link after access change`);
    }
    await controlStillWorks();
    // The owner's activity shows the change.
    const activity = await ok(alice.context, origin, 'GET', `/api/activity?kind=page&limit=50`);
    measured.ownerActivity = activity.items.filter(item => item.target.id === pageId).map(item => item.action).slice(0, 4);
    results[name] = measured;
  };

  // (a) The owner removes Bob's grant in the Share panel.
  await grant(alice.context, origin, pageId, bob.id, 'edit');
  await scenario('removed', async () => {
    const controls = await bobGrantControls(alice, pageId, origin);
    await controls.locator('details summary').filter({ hasText: 'Expiry & removal' }).click();
    const revoked = alice.page.waitForResponse(response => new URL(response.url()).pathname === '/api/sharing' && response.request().method() === 'POST');
    await controls.getByRole('button', { name: 'Remove access', exact: true }).click();
    assert.equal((await revoked).status(), 200);
    return Date.now();
  }, 'closed');
  await mentionsShown('removed', false);
  await shot('alice', 'owner removed access');
  // Regranting is one action.
  await bobGrantControls(alice, pageId, origin);
  const regranted = alice.page.waitForResponse(response => new URL(response.url()).pathname === '/api/sharing' && response.request().method() === 'POST');
  await alice.page.locator('.grant-list > li').filter({ hasText: 'Revoked' }).getByRole('button', { name: 'Regrant access', exact: true }).click();
  assert.equal((await regranted).status(), 200);
  await expect.poll(async () => (await bobApi('GET', `/api/pages/${pageId}`)).body?.permissions?.canEdit).toBe(true);
  await mentionsShown('regranted', true);

  // (b) The owner narrows Bob from edit to view.
  await scenario('narrowed', async () => {
    const controls = await bobGrantControls(alice, pageId, origin);
    const narrowed = alice.page.waitForResponse(response => new URL(response.url()).pathname === '/api/sharing' && response.request().method() === 'POST');
    await controls.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true }).selectOption('view');
    assert.equal((await narrowed).status(), 200);
    return Date.now();
  }, 'read-only');

  // (c) A short expiry set through the route passes while Bob is typing. Bob's one
  // grant is raised back to edit first.
  const bobGrant = async () => {
    const active = (await ok(alice.context, origin, 'GET', `/api/sharing/pages/${pageId}`)).items.filter(item => item.principalId === bob.id && !item.revokedAt);
    assert.equal(active.length, 1, 'Bob holds one grant on the page.');
    return active[0];
  };
  await grant(alice.context, origin, pageId, bob.id, 'edit', { id: (await bobGrant()).id });
  await expect.poll(async () => (await bobApi('GET', `/api/pages/${pageId}`)).body?.permissions?.canEdit).toBe(true);
  let expiresAt;
  await scenario('expired', async () => {
    const current = await bobGrant();
    expiresAt = Date.now() + 3000;
    await grant(alice.context, origin, pageId, bob.id, 'edit', { id: current.id, expiresAt: new Date(expiresAt).toISOString() });
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now())));
    return expiresAt;
  }, 'closed');
  await mentionsShown('expired', false);
  record('mentionDoors', mentionResults);
  const expired = (await ok(alice.context, origin, 'GET', `/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === bob.id);
  assert.equal(expired.status, 'expired', 'An expired grant is shown as expired, not deleted.');
  await alice.page.goto(`${origin}/app/pages/${pageId}?detail=share`, { waitUntil: 'networkidle' });
  await bobGrantControls(alice, pageId, origin);
  await expect(alice.page.locator('.grant-list > li').filter({ hasText: 'Expired' })).toBeVisible();
  await shot('alice', 'owner sees expired grant');
  record('accessChanges', results);
  return { pageId };
}
