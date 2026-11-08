import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { accessible, closeDetails } from './browser-support.mjs';
import { root } from '../../e2e/runtime-harness.mjs';
import { publicPageJourney } from './public-page-journey.mjs';
import { expiryRegrantJourney } from './expiry-journey.mjs';
import { inheritanceChainJourney } from './sharing-inheritance-journey.mjs';
import { permissionLifecycleMatrix, permissionArchiveMatrix, permissionPermanentDeleteMatrix } from './sharing-lifecycle-matrix.mjs';
import { permissionPageEditsMatrix } from './sharing-page-edit-matrix.mjs';
import { permissionDiscussionMatrix, assertDiscussionMutation } from './sharing-discussion-matrix.mjs';
import { call, editable, grant, ok, restrictedPage, withSecondPerson } from './two-people-support.mjs';
import { signInWithOutbox } from '../../e2e/outbox-auth.mjs';

export async function shareJourney(state, pageId) {
  const { page, origin, api, readerCookie, switchIdentity } = state;
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const panel = page.locator('.right');
  await expect(panel.getByRole('heading', { name: 'Share this page' })).toBeVisible();
  assert.ok(await panel.evaluate(element => element.contains(document.activeElement)), 'Share opens with keyboard focus inside its panel.');
  const invite = page.getByRole('combobox', { name: 'Invite someone', exact: true });
  await expect(invite).toBeVisible();
  const inviteBox = await invite.boundingBox();
  const disclosureBox = await panel.locator('.advanced-access').boundingBox();
  assert.ok(inviteBox && disclosureBox && inviteBox.y < disclosureBox.y, 'Invite controls precede inherited-access disclosure.');
  const copyBox = await panel.getByRole('button', { name: 'Copy page link', exact: true }).boundingBox();
  assert.ok(copyBox && copyBox.y < disclosureBox.y, 'Copy link precedes inherited-access disclosure.');
  assert.equal(await panel.locator('.advanced-access').getAttribute('open'), null, 'Inherited access is initially collapsed.');
  await expect(panel.getByRole('button', { name: 'Remove access', exact: true })).toHaveCount(0);
  await expect(panel).not.toContainText(/\bContainers?\b/);
  const dateInputs = await panel.locator('input[type="datetime-local"]').count();
  assert.equal(dateInputs, 0, 'Share uses the app date convention rather than native locale-dependent datetime fields.');
  await invite.selectOption('member:browser-reader');
  await page.getByRole('combobox', { name: 'Permission', exact: true }).selectOption('view');
  await panel.locator('form').first().locator('summary').filter({ hasText: 'Set an access expiry' }).click();
  await panel.locator('form').first().getByRole('textbox', { name: 'Access expiry date and time', exact: true }).fill('31 Dec 2099, 16:30');
  await panel.locator('form').first().getByRole('textbox', { name: 'Access expiry date and time', exact: true }).blur();
  const submittedExpiry = await panel.locator('form').first().locator('input[type="hidden"][name="expiresAt"]').inputValue();
  await expect(panel.locator('form').first()).toContainText('Day month year, 24-hour time');
  await accessible(page, 'share invite');
  await page.getByRole('button', { name: 'Share page', exact: true }).click();
  await panel.locator('.advanced-access summary').first().click();
  await expect(page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true })).toBeVisible();
  await expect(panel.locator('.grant-list')).toContainText('31 Dec 2099');
  const grants = await api(`/api/sharing/pages/${pageId}`);
  assert.ok(grants.items.some(grant => grant.principalId === 'browser-reader' && grant.level === 'view' && !grant.revokedAt));
  assert.equal(new Date(grants.items.find(grant => grant.principalId === 'browser-reader').expiresAt).getFullYear(), 2099);
  const storedExpiry = grants.items.find(grant => grant.principalId === 'browser-reader').expiresAt;
  const readerGrant = panel.locator('.grant-list > li').filter({
    has: page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true }),
  });
  await expect(readerGrant).toHaveCount(1);
  await readerGrant.locator('details summary').click();
  const displayedExpiry = await readerGrant.getByRole('textbox', { name: 'Access expiry date and time', exact: true }).inputValue();
  assert.equal(displayedExpiry, '31 Dec 2099, 16:30');
  assert.equal(submittedExpiry, storedExpiry, 'Displayed and submitted expiry agree with the real grant.');
  const readerDocument = await api(`/api/pages/${pageId}`, { headers: { cookie: readerCookie } });
  assert.equal(readerDocument.page.id, pageId);
  assert.equal(readerDocument.permissions.level, 'view');
  await page.getByRole('button', { name: 'Copy page link', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Link copied', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${origin}/app/pages/${pageId}`);
  await accessible(page, 'shared page link');
  await expiryRegrantJourney({ page, api }, pageId);
  await closeDetails(page);
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeFocused();
  await switchIdentity('reader');
  try {
    await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('member-name')).toHaveText('Morgan Reader');
    await expect(page.locator('.page-document')).toContainText('Keep this unsent detail.');
    await expect(page.locator('.page-document')).toContainText('Second block: record the next action.');
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveAttribute('readonly', '');
    assert.equal(await page.locator('.page-document [contenteditable="true"]').count(), 0, 'The granted reader renders committed content without editable controls.');
    await accessible(page, 'granted reader page');
  } finally { await switchIdentity('owner'); }

  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const ownerPanel = page.locator('.right');
  await ownerPanel.locator('.advanced-access > summary').click();
  const ownerGrant = ownerPanel.locator('.grant-list > li').filter({
    has: page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true }),
  });
  await expect(ownerGrant.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true })).toBeVisible();
  await ownerGrant.locator('details summary').click();
  await ownerGrant.getByRole('button', { name: 'Remove access', exact: true }).click();
  await expect.poll(async () => (await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === 'browser-reader').revokedAt).not.toBeNull();
  const activityLink = page.locator('a[href="/app/settings/activity"]');
  await expect(activityLink).toBeVisible();
  await activityLink.click();
  await page.waitForURL(url => url.pathname === '/app/settings/activity');
  await expect(page.getByRole('heading', { name: 'What changed.', exact: true })).toBeVisible();
  assert.ok((await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === 'browser-reader').revokedAt, 'Opening Activity leaves the removed page grant revoked.');
  await publicPageJourney(state, pageId);
  await grantCorpusJourney(state);
  await inheritanceChainJourney(state);
  await permissionLevelsJourney(state, { extended: false });
}

/** Independent published pages keep level semantics separate from grant narrowing. */
export async function permissionLevelsJourney(state, { extended = true, levels = ['full', 'edit', 'comment', 'view'], section = 'all' } = {}) {
  const { context, origin } = state, width = state.page.viewportSize().width;
  // The owner uses authenticated API probes throughout this matrix. Unmount
  // their unrelated first page so its collaboration polling consumes no reads.
  if (extended) await state.page.goto('about:blank');
  // Complete diagnostic inventories are much more read-heavy than a person.
  // Pace those reads while retaining real production limits and every assertion.
  let nextRead = 0;
  const api = async (...args) => {
    // Reserve the existing paced slot before awaiting it, including parallel
    // inventory reads. At most 572 diagnostic reads/minute leave room under
    // the unchanged 600-request production limit; the owner view is idle.
    const slot = Math.max(nextRead, Date.now());
    nextRead = slot + (extended ? 105 : 0);
    const delay = slot - Date.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    return state.api(...args);
  };
  const records = [], refusals = [];
  const configuration = await api('/api/sharing/configuration');
  assert.deepEqual(new Set(configuration.levels), new Set(['full', 'edit', 'comment', 'view']));
  // First-run already admitted the extended matrix's recipient natively.
  // Keep the original selected matrix intact in both responsive core callers.
  let recipient = { id: 'browser-owner' }, recipientContext;
  if (extended) {
    recipient = (await api('/api/members')).items.find(item => item.id !== 'browser-owner' && item.id !== 'browser-reader' && item.role === 'member');
    assert.ok(recipient, 'A separately admitted ordinary member receives the new grant.');
    const recipientSession = await signInWithOutbox(origin, recipient.email);
    recipientContext = await context.browser().newContext();
    await recipientContext.addCookies([{ name: 'slate_session', value: recipientSession.cookie.split('=')[1], url: origin }]);
  }
  try { await withSecondPerson(state, width, async ({ bob }) => {
    const member = (await ok(bob.context, origin, 'GET', '/api/session')).member;
    assert.equal(member.id, 'browser-reader');
    assert.equal(member.role, 'member');
    for (const level of levels) {
      const phase = async (name, run) => {
        const started = performance.now();
        try { return await run(); }
        finally { console.log(`SHARING_PHASE ${level} ${name} ${width}: ${Math.round(performance.now() - started)} ms`); }
      };
      const canEdit = level === 'full' || level === 'edit', canComment = level !== 'view', canShare = level === 'full';
      const initialTitle = `Permission ${level} guide`, initialBody = `Published ${level} response instructions.`;
      const { pageId, blockIds: [blockId] } = await restrictedPage(state, initialTitle, [initialBody]);
      const route = `/api/pages/${pageId}`, commentsRoute = `/api/comments/page/${pageId}`;
      const readerGrant = (await grant(context, origin, pageId, member.id, level)).value.id;
      let current = await api(route);
      await ok(context, origin, 'POST', `${route}/publish`, { operationKey: randomUUID(), expectedRevisionId: current.page.revisionId });
      // A populated discussion proves read access even for a member who cannot comment.
      const ownerComment = (await ok(context, origin, 'POST', commentsRoute, { operationKey: randomUUID(), body: [{ text: `Owner context for ${level}.` }] })).value.id;
      current = await ok(bob.context, origin, 'GET', route);
      assert.equal(current.authorMemberId, 'browser-owner');
      assert.equal(current.properties.ownerMemberId, 'browser-owner');
      assert.equal(current.page.lifecycle, 'live');
      assert.ok(current.publishedRevisionId);
      assert.equal(current.permissions.level, level);
      assert.equal(current.permissions.canEdit, canEdit);
      assert.equal(current.permissions.canShare, canShare);
      assert.equal(current.page.title, initialTitle);
      assert.equal(current.blocks.find(block => block.id === blockId).content.text.map(span => span.text).join(''), initialBody);
      const memberDiscussion = await ok(bob.context, origin, 'GET', commentsRoute);
      assert.equal(memberDiscussion.comments[0].id, ownerComment);
      const metadata = {};
      if (extended) {
        metadata.details = await ok(bob.context, origin, 'GET', `${route}/details`);
        assert.equal(metadata.details.owner.id, 'browser-owner');
        assert.equal(metadata.details.characterCount, initialBody.length);
        metadata.linkCard = await ok(bob.context, origin, 'GET', `${route}/link-card`);
        assert.equal(metadata.linkCard.title, initialTitle);
        metadata.history = await ok(bob.context, origin, 'GET', `/api/revisions/${pageId}`);
        assert.ok(metadata.history.items.some(item => item.id === current.publishedRevisionId));
        metadata.published = await ok(bob.context, origin, 'GET', `/api/revisions/${pageId}/${current.publishedRevisionId}`);
        assert.equal(metadata.published.properties.title, initialTitle);
        assert.deepEqual(metadata.published.blocks.find(block => block.id === blockId).content, { text: [{ text: initialBody }] });
      }
      records.push({ level, pageId, read: { document: current, discussion: memberDiscussion, ...metadata } });

      // No page activity can precede its native creation time. Keep every
      // cursor page from that inclusive boundary, including all read receipts.
      const createdAt = current.createdAt;
      const activity = async () => {
        const items = [];
        let cursor;
        do {
          const result = await api('/api/activity?' + new URLSearchParams({ from: createdAt, limit: '100', ...(cursor ? { cursor } : {}) }));
          items.push(...result.items);
          cursor = result.nextCursor;
        } while (cursor);
        return items.filter(item => item.target.id === pageId || item.context?.pageId === pageId);
      };
      const snapshot = async () => {
        // The actor is idle during an inventory. Start the expensive paginated
        // activity read first and overlap the four independent canonical reads.
        const [events, document, revisions, comments, grants] = await Promise.all([
          activity(), api(route), api(`/api/revisions/${pageId}`),
          api(commentsRoute), api(`/api/sharing/pages/${pageId}`),
        ]);
        return { document, revisions, comments, grants, activity: events };
      };
      const refuse = async (method, target, input, status = 404, baseline) => {
        const before = baseline ?? await snapshot();
        const result = await call(bob.context, origin, method, target, input);
        assert.equal(result.status, status, `${level} cannot ${method} ${target}`);
        assert.equal(result.body.code, status === 404 ? 'NOT_FOUND' : status === 409 ? 'PAGE_LOCKED' : 'FORBIDDEN');
        const after = await snapshot();
        assert.deepEqual(after, before, `${level} refusal changes no page, revision, comment, grant or activity.`);
        refusals.push({ level, method, target, input, result, before, after });
      };
      const committed = async (method, target, action, perform) => {
        const before = await snapshot();
        const opened = action === 'pages.update' || action === 'pages.block.update'
          ? bob.page.waitForResponse(response => new URL(response.url()).pathname === `${route}/open` && response.request().method() === 'POST') : null;
        const pending = bob.page.waitForResponse(response => new URL(response.url()).pathname === target && response.request().method() === method);
        await perform();
        const response = await pending;
        assert.equal(response.status(), 200, await response.text());
        const input = response.request().postDataJSON(), result = await response.json();
        assert.equal(result.receipt.operationKey, input.operationKey);
        assert.equal(result.receipt.revisionId, result.receipt.entity.revisionId);
        if (opened) {
          const rendered = await opened;
          assert.equal(rendered.status(), 200, await rendered.text());
          assert.equal((await rendered.json()).receipt.revisionId, result.receipt.revisionId, 'The browser commits its read of the edited revision before replay is measured.');
        }
        await bob.page.waitForLoadState('networkidle');
        const after = await snapshot();
        const added = after.activity.filter(item => !before.activity.some(previous => previous.id === item.id) && item.action !== 'pages.open');
        // Rendering the committed revision records its own native read receipt.
        // Keep that read in the inventory; the mutation itself must occur once.
        for (const opened of after.activity.filter(item => !before.activity.some(previous => previous.id === item.id) && item.action === 'pages.open')) {
          assert.equal(opened.actor.id, member.id);
          assert.equal(opened.target.id, pageId);
          assert.equal(opened.context.revisionId, after.document.workingRevisionId);
        }
        assert.equal(added.length, 1);
        assert.equal(added[0].id, result.receipt.activityId);
        assert.equal(added[0].operationKey, input.operationKey);
        assert.equal(added[0].action, action);
        assert.equal(added[0].actor.id, member.id);
        assert.equal(added[0].occurredAt, result.receipt.committedAt);
        for (const previous of before.activity) assert.deepEqual(after.activity.find(item => item.id === previous.id), previous);
        if (action === 'pages.update' || action === 'pages.block.update') {
          assert.equal(after.document.workingRevisionId, result.receipt.revisionId);
          assert.equal(after.revisions.items.length, before.revisions.items.length + 1);
          assert.ok(after.revisions.items.some(item => item.id === result.receipt.revisionId));
          for (const revision of before.revisions.items) assert.deepEqual(after.revisions.items.find(item => item.id === revision.id), revision);
          if (action === 'pages.update') assert.deepEqual(after.document.blocks, before.document.blocks);
          else assert.deepEqual(after.document.properties, before.document.properties);
          assert.deepEqual(after.comments, before.comments);
          const expectedGrants = structuredClone(before.grants);
          // Grant provenance displays the page's current title, not a stored ACL field.
          for (const item of [...expectedGrants.items, ...expectedGrants.effectiveItems]) item.origin.name = after.document.page.title;
          expectedGrants.restriction.name = after.document.page.title;
          assert.deepEqual(after.grants, expectedGrants);
        } else {
          assert.deepEqual(after.document, before.document);
          assert.deepEqual(after.revisions, before.revisions);
          if (action === 'comments.create') {
            assert.deepEqual(after.grants, before.grants);
            assert.equal(after.comments.comments.length, before.comments.comments.length + 1);
            assert.equal(after.comments.threads.length, before.comments.threads.length + (input.threadId ? 0 : 1));
            for (const comment of before.comments.comments) assert.deepEqual(after.comments.comments.find(item => item.id === comment.id), comment);
            assert.deepEqual(after.comments.reactions, before.comments.reactions);
          } else if (action.startsWith('comments.')) {
            assert.deepEqual(after.grants, before.grants);
            assertDiscussionMutation({ before: before.comments, after: after.comments, action, target, input, result, memberId: member.id, pageId });
          } else {
            assert.deepEqual(after.comments, before.comments);
            assert.equal(after.grants.items.length, before.grants.items.length + (input.id ? 0 : 1));
            for (const item of before.grants.items.filter(item => item.id !== input.id)) assert.deepEqual(after.grants.items.find(grant => grant.id === item.id), item);
            const changed = after.grants.items.find(item => item.id === result.value.id);
            assert.deepEqual([changed.principalKind, changed.principalId, changed.level, changed.expiresAt, changed.revokedAt], [input.principalKind, input.principalId, input.level, input.expiresAt ?? null, input.revoke ? result.receipt.committedAt : null]);
            assert.deepEqual(after.grants.inheritedItems, before.grants.inheritedItems);
          }
        }
        const replay = await ok(bob.context, origin, method, target, input);
        assert.deepEqual(replay.receipt, result.receipt);
        assert.deepEqual(await snapshot(), after, 'Replaying an allowed capture creates no extra content, revision, comment, grant or activity.');
        records.push({ level, method, target, input, result, before, after });
        return result;
      };
      const view = bob.page;
      await view.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
      await view.reload({ waitUntil: 'networkidle' });
      const title = view.getByRole('textbox', { name: 'Page title', exact: true });
      await expect(title).toHaveValue(initialTitle);
      await expect(view.locator(`[data-block-id="${blockId}"]`).first()).toContainText(initialBody);
      if (canEdit) {
        await expect(title).not.toHaveAttribute('readonly', '');
        await expect(editable(view, blockId)).toBeVisible();
        const nextTitle = `Member revised ${level} guide`, nextBody = `Member revised ${level} response instructions.`;
        await committed('PATCH', route, 'pages.update', async () => {
          await title.fill(nextTitle);
          await editable(view, blockId).click();
        });
        assert.equal((await api(route)).page.title, nextTitle);
        await committed('PATCH', `${route}/blocks/${blockId}`, 'pages.block.update', () => editable(view, blockId).fill(nextBody));
        assert.deepEqual((await api(route)).blocks.find(block => block.id === blockId).content, { text: [{ text: nextBody }] });
        await view.reload({ waitUntil: 'networkidle' });
        await expect(title).toHaveValue(nextTitle);
        await expect(editable(view, blockId)).toHaveText(nextBody);
      } else {
        await expect(title).toHaveAttribute('readonly', '');
        assert.equal(await view.locator('.page-document [contenteditable="true"]').count(), 0);
        current = await api(route);
        await refuse('PATCH', route, { operationKey: randomUUID(), expectedRevisionId: current.page.revisionId, properties: { title: 'Refused member title' } });
        await refuse('PATCH', `${route}/blocks/${blockId}`, { operationKey: randomUUID(), expectedRevisionId: current.blocks.find(block => block.id === blockId).revisionId, content: { text: [{ text: 'Refused member body' }] } });
      }
      await accessible(view, `${level} member page after reload`);
      if (extended && section !== 'discussion') await phase('page edits', () => permissionPageEditsMatrix({ state, bob, api, level, pageId, blockId, recipientId: recipient.id, snapshot, refuse, records }));

      if (extended && section !== 'discussion') {
        await phase('lifecycle', () => permissionLifecycleMatrix({ state, bob, api, level, pageId, snapshot, refuse, records }));
        await phase('archive', () => permissionArchiveMatrix({ state, bob, api, level, pageId, snapshot, records, refusals }));
        const unrelated = await snapshot();
        await phase('erasure', () => permissionPermanentDeleteMatrix({ state, bob, api, level, records }));
        assert.deepEqual(await snapshot(), unrelated, 'Erasing or retaining a separately granted page never changes the other page.');
        await view.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
      }
      if (section !== 'page') {
      await view.getByRole('button', { name: 'Comments', exact: true }).click();
      await expect(view.locator(`#comment-${ownerComment}`)).toContainText(`Owner context for ${level}.`);
      const composer = view.getByRole('textbox', { name: 'Comment text', exact: true });
      let memberComment;
      if (canComment) {
        await expect(composer).toBeVisible();
        const text = `Member ${level} response confirmed.`;
        const created = await committed('POST', commentsRoute, 'comments.create', async () => {
          await composer.fill(text);
          await view.getByRole('button', { name: 'Send comment', exact: true }).click();
        });
        memberComment = created.value.id;
        const stored = (await api(commentsRoute)).comments;
        assert.deepEqual(stored.map(item => item.id), [ownerComment, created.value.id]);
        assert.deepEqual(stored[1].body, [{ text }]);
        assert.equal(stored[1].authorMemberId, member.id);
        assert.equal(stored[1].revisionId, created.receipt.revisionId);
        await view.reload({ waitUntil: 'networkidle' });
        if (!await view.locator('.right').isVisible()) await view.getByRole('button', { name: 'Comments', exact: true }).click();
        await expect(view.locator(`#comment-${created.value.id}`)).toContainText(text);
        await expect(composer).toBeVisible();
      } else {
        await expect(composer).toHaveCount(0);
        await expect(view.getByRole('button', { name: 'Send comment', exact: true })).toHaveCount(0);
        await refuse('POST', commentsRoute, { operationKey: randomUUID(), body: [{ text: 'Refused member comment' }] });
        await expect(view.locator('.right')).toContainText('Read-only discussion.');
      }
      await accessible(view, `${level} member discussion after reload`);
      if (extended) await phase('discussion', () => permissionDiscussionMatrix({ view, api, level, pageId, ownerComment, memberComment, committed, refuse }));
      await closeDetails(view);
      await view.getByRole('button', { name: 'Share', exact: true }).click();
      const panel = view.locator('.right'), invite = panel.getByRole('combobox', { name: 'Invite someone', exact: true });
      if (canShare) {
        await expect(invite).toBeVisible();
        if (extended) assert.equal((await call(recipientContext, origin, 'GET', route)).status, 404, 'The recipient initially has no access to this restricted page.');
        await invite.selectOption(`member:${recipient.id}`);
        await panel.getByRole('combobox', { name: 'Permission', exact: true }).selectOption('view');
        const shared = await committed('POST', '/api/sharing', 'sharing.grant', () => panel.getByRole('button', { name: 'Share page', exact: true }).click());
        const row = panel.locator(`[data-grant-id="${shared.value.id}"]`);
        await expect(row.getByRole('combobox')).toHaveValue('view');
        if (extended) assert.equal((await ok(recipientContext, origin, 'GET', route)).permissions.level, 'view');
        const changes = [];
        for (const changedLevel of extended ? ['comment', 'edit', 'full', 'view'] : ['comment']) {
          changes.push(await committed('POST', '/api/sharing', 'sharing.grant', () => row.getByRole('combobox').selectOption(changedLevel)));
          await view.reload({ waitUntil: 'networkidle' });
          if (!await panel.isVisible()) await view.getByRole('button', { name: 'Share', exact: true }).click();
          await expect(row.getByRole('combobox')).toHaveValue(changedLevel);
          assert.equal((await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.id === shared.value.id).level, changedLevel);
          if (extended) {
            const received = await ok(recipientContext, origin, 'GET', route);
            assert.equal(received.permissions.level, changedLevel);
            assert.equal(received.permissions.canEdit, changedLevel === 'full' || changedLevel === 'edit');
            assert.equal(received.permissions.canShare, changedLevel === 'full');
          }
        }
        if (extended) {
        await row.locator('details > summary').click();
        const revoked = await committed('POST', '/api/sharing', 'sharing.grant', () => row.getByRole('button', { name: 'Remove access', exact: true }).click());
        await view.reload({ waitUntil: 'networkidle' });
        if (!await panel.isVisible()) await view.getByRole('button', { name: 'Share', exact: true }).click();
        await expect(row).toContainText('Revoked');
        await expect(row.getByRole('combobox')).toHaveCount(0);
        await expect(row.getByRole('button', { name: 'Regrant access', exact: true })).toBeVisible();
        const grants = await api(`/api/sharing/pages/${pageId}`);
        assert.equal(grants.items.length, 3);
        assert.equal(grants.items.find(item => item.id === shared.value.id).level, 'view');
        assert.equal(grants.items.find(item => item.id === shared.value.id).revokedAt, revoked.receipt.committedAt);
        assert.equal(grants.items.find(item => item.id === readerGrant).level, 'full');
        assert.equal((await call(recipientContext, origin, 'GET', route)).status, 404, 'Revoking the new recipient grant ends their actual access.');
        // The actor retains their independent full grant throughout this scenario.
        const retained = await snapshot();
        for (const result of [shared, ...changes]) {
          const captured = records.find(item => item.result === result);
          assert.deepEqual((await ok(bob.context, origin, captured.method, captured.target, captured.input)).receipt, result.receipt);
          assert.deepEqual(await snapshot(), retained, 'Replaying a former grant creation or level change cannot revive a revoked grant.');
        }
        } else {
          const grants = await api(`/api/sharing/pages/${pageId}`);
          assert.equal(grants.items.length, 3);
          assert.equal(grants.items.find(item => item.id === shared.value.id).level, 'comment');
          assert.equal(grants.items.find(item => item.id === readerGrant).level, 'full');
        }
      } else {
        await expect(invite).toHaveCount(0);
        await expect(panel.getByRole('combobox')).toHaveCount(0);
        await expect(panel.getByRole('button', { name: 'Share page', exact: true })).toHaveCount(0);
        await expect(panel.getByRole('button', { name: 'Remove access', exact: true })).toHaveCount(0);
        const input = { targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: member.id, level: 'full' };
        await refuse('POST', '/api/sharing', { ...input, operationKey: randomUUID() });
        for (const changedLevel of extended ? ['full', 'edit', 'comment', 'view'] : ['full']) {
          await refuse('POST', '/api/sharing', { ...input, id: readerGrant, level: changedLevel, operationKey: randomUUID() });
        }
        if (extended) await refuse('POST', '/api/sharing', { ...input, id: readerGrant, level, revoke: true, operationKey: randomUUID() });
      }
      await accessible(view, `${level} member sharing after reload`);
      }
      if (extended) {
      const captures = records.filter(item => item.level === level && item.method);
      const retained = await snapshot();
      for (const captured of captures) {
        assert.deepEqual((await ok(bob.context, origin, captured.method, captured.target, captured.input)).receipt, captured.result.receipt);
        assert.deepEqual(await snapshot(), retained, 'Old captures cannot restore deleted comments, removed reactions or revoked grants.');
      }
      // End this independent page's scenario by revoking its member grant.
      // A current session may neither read it nor replay a formerly allowed write.
      const revoked = await ok(context, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), id: readerGrant, targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: member.id, level, revoke: true });
      assert.equal((await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.id === readerGrant).revokedAt, revoked.receipt.committedAt);
      const revokedState = await snapshot();
      await refuse('GET', route, undefined, 404, revokedState);
      await refuse('GET', commentsRoute, undefined, 404, revokedState);
      for (const target of [`${route}/details`, `${route}/link-card`, `/api/revisions/${pageId}`, `/api/revisions/${pageId}/${current.publishedRevisionId}`]) {
        await refuse('GET', target, undefined, 404, revokedState);
      }
      for (const captured of captures) await refuse(captured.method, captured.target, captured.input, 404, revokedState);
      await view.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
      await expect(view.getByRole('heading', { name: 'Access needed', exact: true })).toBeVisible();
      const visible = await view.locator('.content-frame').innerText();
      for (const content of [initialTitle, initialBody, `Member revised ${level} guide`, `Owner context for ${level}.`]) assert.ok(!visible.includes(content), 'Revocation exposes no prior title, body or discussion.');
      await accessible(view, `${level} revoked member cannot recover prior content`);
      }
      records.push({ level, pageId, blockId, readerGrant, final: await snapshot() });
      console.log(`PROBE SHARE-002 ${level}/${section}: ${extended ? 'native operation inventories, replays and revoked captures' : 'selected reads, title, body, comment and direct grants'}; ${refusals.filter(item => item.level === level).length} refused requests preserve inventories at ${width}px`);
    }
  }); } finally { await recipientContext?.close(); }
  const directory = path.join(root, '.artifacts/ui-convergence/permission-levels', String(width));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, extended && levels.length === 1 ? `matrix-${levels[0]}${section === 'all' ? '' : `-${section}`}.json` : 'matrix.json'), JSON.stringify({ width, extended, section, configuration, records, refusals }, null, 2));
}

/** Native grants, rather than seeded ACL rows, drive the loaded Share panel. */
async function grantCorpusJourney({ page, context, origin, api, readerCookie }) {
  const mutate = (route, data, method = 'POST') => ok(context, origin, method, route, { ...data, operationKey: crypto.randomUUID() });
  const space = (await mutate('/api/containers', { name: 'Sharing corpus', visibility: 'private' })).value.id;
  const parent = (await mutate('/api/pages', { containerId: space, title: 'Grant source' })).value.pageId;
  const child = (await mutate('/api/pages', { containerId: space, parentPageId: parent, title: 'Grant recipient' })).value.pageId;
  const group = (await mutate('/api/groups', { name: 'Sharing editors', memberIds: ['browser-owner'] })).value.id;
  const future = '2099-12-30T15:45:00.000Z', past = '2000-01-02T12:00:00.000Z';
  const grant = async (targetKind, targetId, principalKind, principalId, level, expiresAt = null) => {
    const input = { operationKey: crypto.randomUUID(), targetKind, targetId, principalKind, principalId, level, expiresAt };
    return { ...input, id: (await ok(context, origin, 'POST', '/api/sharing', input)).value.id };
  };
  // Keep an independent record of the requests and returned grant ids. The API
  // projection and the panel must both agree with this corpus after reload.
  const own = [];
  own.push(await grant('page', child, 'member', 'browser-owner', 'full'));
  own.push(await grant('page', child, 'member', 'browser-reader', 'view', future));
  own.push(await grant('page', child, 'group', group, 'edit'));
  own.push(await grant('page', child, 'container', space, 'comment', future));
  const ancestor = [await grant('page', parent, 'member', 'browser-reader', 'comment', future),
    await grant('page', parent, 'group', group, 'full')];
  const general = await grant('container', space, 'workspace', 'browser-workspace', 'view', future);
  const fields = item => [item.id, item.principalKind, item.principalId, item.level, item.expiresAt];
  const containerRows = (await api(`/api/sharing/containers/${space}`)).items;
  assert.equal(containerRows.length, 2, 'The native space has only its creator and the added workspace grant.');
  assert.deepEqual(fields(containerRows.find(item => item.id === general.id)), fields(general), 'The inherited workspace grant retains the submitted principal, level and expiry.');
  assert.deepEqual(new Set(own.map(item => item.level)), new Set((await api('/api/sharing/configuration')).levels));
  const project = () => api(`/api/sharing/pages/${child}`);
  const readAsReader = () => api(`/api/pages/${child}`, { headers: { cookie: readerCookie } });
  const label = level => ({ full: 'Manage access', edit: 'Edit', comment: 'Comment', view: 'View' })[level];
  const panel = page.locator('.right');
  async function inspect(expectedOwn, expectedInherited, screenshot) {
    const projection = await project();
    assert.deepEqual(projection.items.map(fields), expectedOwn.map(fields), 'Direct grants retain native creation order and values.');
    assert.deepEqual(projection.inheritedItems.map(fields).sort(), expectedInherited.map(fields).sort(), 'All and only traversed ancestor and container grants are returned.');
    assert.deepEqual(projection.effectiveItems.map(item => item.id).sort(),
      [...expectedOwn, ...expectedInherited].filter(item => !item.revokedAt && (!item.expiresAt || item.expiresAt === future)).map(item => item.id).sort(), 'Expired and revoked grants never enter the effective list.');
    await page.goto(`${origin}/app/pages/${child}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Share this page', exact: true })).toBeVisible();
    await expect(panel.locator('.grant-list > li')).toHaveCount(expectedOwn.length);
    assert.deepEqual(await panel.locator('.grant-list > li').evaluateAll(rows => rows.map(row => row.dataset.grantId)), expectedOwn.map(item => item.id));
    await expect(panel.locator('.inherited-grant-list > li')).toHaveCount(expectedInherited.length);
    for (const item of [...projection.items, ...projection.inheritedItems]) {
      const row = panel.locator(`[data-grant-id="${item.id}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(item.principalLabel);
      if (item.inherited) {
        assert.equal(item.origin.kind, ancestor.some(grant => grant.id === item.id) ? 'page' : 'container');
        assert.equal(item.origin.id, item.origin.kind === 'page' ? parent : space);
        assert.equal(item.origin.name, item.origin.kind === 'page' ? 'Grant source' : 'Sharing corpus');
        await expect(row).toContainText(`From ${item.origin.name}`);
        await expect(row).toContainText(label(item.level));
        await expect(row).toContainText(item.status);
        await expect(row.getByRole('combobox')).toHaveCount(0);
      } else if (item.revokedAt) await expect(row).toContainText('Revoked');
      else await expect(row.getByRole('combobox')).toHaveValue(item.level);
      if (item.expiresAt) {
        const date = await page.evaluate(value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)), item.expiresAt);
        await expect(row).toContainText(`${item.status === 'expired' ? 'Expired' : 'Expires'} ${date}`);
      } else await expect(row).not.toContainText(/Expires |Expired /);
    }
    if (screenshot) await accessible(page, screenshot);
    return projection;
  }
  await inspect(own, [...ancestor, ...containerRows], 'all effective direct and inherited grants with expiry');
  assert.equal((await readAsReader()).permissions.level, 'comment');

  const reader = await context.browser().newContext();
  await reader.addCookies([{ name: 'slate_session', value: readerCookie.split('=')[1], url: origin }]);
  try {
    const before = await project();
    assert.equal((await call(reader, origin, 'GET', `/api/sharing/pages/${child}`)).status, 404);
    assert.equal((await call(reader, origin, 'POST', '/api/sharing', { ...own[1], id: own[1].id, operationKey: crypto.randomUUID(), level: 'full' })).status, 404);
    assert.deepEqual(await project(), before, 'A reader cannot expose or change the grant inventory.');
  } finally { await reader.close(); }

  // A page has one general grant. Replacing the container principal with the
  // workspace principal leaves every person and group grant intact.
  own[3] = await grant('page', child, 'workspace', 'browser-workspace', 'comment');
  await inspect(own, [...ancestor, ...containerRows]);
  assert.equal((await readAsReader()).permissions.level, 'comment');
  await panel.locator('.advanced-access > summary').click();
  await panel.getByRole('button', { name: 'Restrict inherited access', exact: true }).click();
  await expect.poll(async () => (await project()).restricted).toBe(true);
  await inspect(own, [], 'restricted page retains only direct grants');
  assert.equal((await readAsReader()).permissions.level, 'comment', 'Direct workspace access survives the inheritance restriction.');

  // Expire the direct general grant and revoke the direct person grant, then
  // replay its original capture. Neither inactive grant may regain authority.
  own[3].expiresAt = past;
  await mutate('/api/sharing', own[3]);
  await mutate('/api/sharing', { ...own[1], revoke: true });
  own[1].revokedAt = (await project()).items.find(item => item.id === own[1].id).revokedAt;
  await ok(context, origin, 'POST', '/api/sharing', { ...own[1], id: undefined, revokedAt: undefined });
  assert.ok((await project()).items.find(item => item.id === own[1].id).revokedAt, 'A replay cannot restore a revoked grant.');
  await inspect(own, [], 'revoked and expired direct grants remain inactive after replay');
  const denied = await context.request.get(origin + `/api/pages/${child}`, { headers: { cookie: readerCookie } });
  assert.equal(denied.status(), 404);

  await panel.locator('.advanced-access > summary').click();
  await panel.getByRole('button', { name: 'Restore inherited access', exact: true }).click();
  await expect.poll(async () => (await project()).restricted).toBe(false);
  await inspect(own, [...ancestor, ...containerRows]);
  assert.equal((await readAsReader()).permissions.level, 'comment', 'Restoring inheritance uses the ancestor grant without copying it.');
  ancestor[0].expiresAt = past;
  await mutate('/api/sharing', ancestor[0]);
  await inspect(own, [...ancestor, ...containerRows], 'expired ancestor grant preserves source and expiry');
  assert.equal((await readAsReader()).permissions.level, 'view', 'An expired ancestor grant falls back to current space access.');
  await mutate('/api/sharing', { ...general, revokedAt: undefined, revoke: true });
  containerRows.find(item => item.id === general.id).revokedAt = (await project()).inheritedItems.find(item => item.id === general.id).revokedAt;
  await inspect(own, [...ancestor, ...containerRows]);
  const revoked = await context.request.get(origin + `/api/pages/${child}`, { headers: { cookie: readerCookie } });
  assert.equal(revoked.status(), 404, 'Revoked and expired inherited grants disclose no page.');
}
