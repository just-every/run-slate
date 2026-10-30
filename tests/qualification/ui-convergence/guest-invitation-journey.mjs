import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { inbox, newOutboxLink } from '../../e2e/outbox-auth.mjs';
import { accessible } from './browser-evidence.mjs';
import { call, grant, ok } from './two-people-support.mjs';

/** Share to an unknown person through the UI, then exercise the native one-use door. */
export async function guestInvitationJourney(state) {
  const { page, context, origin, api, switchIdentity } = state;
  const width = page.viewportSize().width;
  const acceptedEmail = [`synthetic-slate-invited-${width}`, 'test.invalid'].join('@');
  const cancelledEmail = [`synthetic-slate-cancelled-${width}`, 'test.invalid'].join('@');
  const space = (await ok(context, origin, 'POST', '/api/containers', {
    operationKey: randomUUID(), name: 'Invitation response guides', visibility: 'private',
  })).value.id;
  const create = async title => (await ok(context, origin, 'POST', '/api/pages', {
    operationKey: randomUUID(), containerId: space, title,
  })).value.pageId;
  const shared = await create('Invitation shared response guide');
  const secret = await create('Invitation private response plan');
  await grant(context, origin, shared, 'browser-reader', 'full');
  const membersBefore = await api('/api/members');
  const guest = await context.browser().newContext({ viewport: page.viewportSize() });
  const guestPage = await guest.newPage();

  // Read canonical rows with the Worker stopped, using the harness's existing
  // checkpoint door. No domain fixture or authority is inserted by this journey.
  // Pause every open view so its background requests cannot race that restart.
  const snapshot = async () => {
    const views = context.browser().contexts().flatMap(view => view.pages());
    const locations = views.map(view => view.url());
    for (const view of views) await view.goto('about:blank');
    let result;
    try {
      result = await state.atRest(`
        SELECT id,email,kind,page_id,page_grant_id,invited_by_member_id,accepted_by_member_id,revoked_at
          FROM invitations WHERE page_id='${shared}' ORDER BY id;
        SELECT id,principal_id,level,revoked_at FROM page_grants WHERE page_id='${shared}' ORDER BY id;
        SELECT id,email,role,member_kind,status FROM members ORDER BY id;
        SELECT id,member_id,revoked_at FROM sessions ORDER BY id;`);
    } finally {
      for (const [index, view] of views.entries()) {
        if (locations[index] !== 'about:blank') await view.goto(locations[index], { waitUntil: 'networkidle' });
      }
    }
    const [invitations, grants, members, sessions] = result.map(row => row.results);
    return { invitations, grants, members, sessions };
  };
  const openShare = async () => {
    await page.goto(`${origin}/app/pages/${shared}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    return page.locator('.right');
  };
  const send = async email => {
    const panel = await openShare();
    await panel.locator('summary').filter({ hasText: /^Invite by email$/ }).click();
    await panel.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
    await panel.getByRole('combobox', { name: 'Invitation access', exact: true }).selectOption('view');
    const before = await inbox(origin);
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/invitations' && response.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Send invitation', exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200, await response.text());
    const request = response.request().postDataJSON();
    assert.equal(request.kind, 'guest');
    assert.equal(request.pageId, shared);
    assert.equal(request.email, email);
    assert.equal(request.level, 'view');
    await expect(panel.getByRole('status')).toHaveText(`Invitation sent to ${email}`);
    const link = new URL(await newOutboxLink(origin, before));
    assert.equal(link.pathname, '/api/auth/invitation/accept');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(panel.getByRole('heading', { name: 'Share this page', exact: true })).toBeVisible();
    const row = panel.locator('.grant-list > li').filter({ hasText: email });
    await expect(row).toContainText('pending invitation');
    await expect(row.getByRole('combobox', { name: `Access for ${email}`, exact: true })).toHaveValue('view');
    await expect(row.getByRole('combobox')).toBeDisabled();
    const grants = await api(`/api/sharing/pages/${shared}`);
    const pending = grants.items.find(item => item.invitationEmail === email);
    assert.ok(pending.invitationId);
    assert.equal(pending.principalId, `invitation:${pending.invitationId}`);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.level, 'view');
    assert.equal(pending.effective, false, 'A pending address confers no authority.');
    assert.ok(!grants.effectiveItems.some(item => item.id === pending.id));
    await accessible(page, 'pending unknown person invitation');
    return { link, request, pending };
  };
  const refuse = async link => {
    for (const method of ['GET', 'POST']) {
      const response = await guest.request.fetch(method === 'GET' ? link.href : origin + link.pathname, {
        method, headers: { origin }, ...(method === 'POST' ? { form: { token: link.searchParams.get('token') } } : {}), maxRedirects: 0,
      });
      assert.equal(response.status(), 400);
      assert.match(await response.text(), /This invitation is invalid or expired/);
      assert.equal(response.headers()['set-cookie'], undefined, 'A refused token issues no session.');
    }
  };
  try {
    await switchIdentity('reader');
    const inviter = await api('/api/members/current');
    assert.equal(inviter.id, 'browser-reader');
    assert.equal(inviter.role, 'member', 'The inviter is a non-owner full member.');
    assert.equal((await api(`/api/pages/${shared}`)).permissions.level, 'full');
    const admitted = await send(acceptedEmail);
    const pending = await snapshot();
    assert.ok(!pending.members.some(member => member.email === acceptedEmail), 'The address is genuinely unknown and is not admitted before acceptance.');
    assert.deepEqual(pending.invitations, [{
      id: admitted.pending.invitationId, email: acceptedEmail, kind: 'guest', page_id: shared,
      page_grant_id: admitted.pending.id, invited_by_member_id: inviter.id, accepted_by_member_id: null, revoked_at: null,
    }]);
    assert.ok(pending.grants.some(item => item.id === admitted.pending.id && item.principal_id === `invitation:${admitted.pending.invitationId}` && item.revoked_at === null));
    assert.equal((await call(guest, origin, 'GET', `/api/pages/${shared}`)).status, 401);
    const preview = await guestPage.goto(admitted.link.href, { waitUntil: 'networkidle' });
    assert.equal(preview.status(), 200);
    await expect(guestPage.getByRole('button', { name: 'Accept invitation', exact: true })).toBeVisible();
    assert.equal((await call(guest, origin, 'GET', '/api/session')).status, 401, 'Previewing the link does not accept it.');
    const acceptance = guestPage.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/invitation/accept' && response.request().method() === 'POST');
    await guestPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    const acceptedResponse = await acceptance;
    assert.equal(acceptedResponse.status(), 303);
    assert.equal(acceptedResponse.headers().location, '/app');
    assert.ok((await acceptedResponse.allHeaders())['set-cookie']);
    const who = await ok(guest, origin, 'GET', '/api/members/current');
    assert.equal(who.email, acceptedEmail);
    assert.equal(who.memberKind, 'guest');
    assert.equal(who.role, 'member');
    const document = await ok(guest, origin, 'GET', `/api/pages/${shared}`);
    assert.equal(document.page.title, 'Invitation shared response guide');
    assert.equal(document.permissions.level, 'view');
    assert.equal(document.permissions.canEdit, false);
    assert.equal(document.permissions.canShare, false);
    assert.equal((await call(guest, origin, 'GET', `/api/pages/${secret}`)).status, 404);
    assert.equal((await call(guest, origin, 'GET', `/api/containers/${space}`)).status, 404);
    assert.equal((await call(guest, origin, 'GET', '/api/members')).status, 403);
    assert.equal((await call(guest, origin, 'PATCH', `/api/pages/${shared}`, {
      operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, properties: { title: 'Forbidden guest edit' },
    })).status, 404);
    assert.deepEqual(await ok(guest, origin, 'GET', `/api/pages/${shared}`), document, 'The refused edit changes no content or revision.');
    assert.deepEqual((await ok(guest, origin, 'GET', '/api/search?q=Invitation')).items.map(item => item.id), [shared]);
    await guestPage.goto(`${origin}/app/pages/${shared}`, { waitUntil: 'networkidle' });
    await expect(guestPage.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Invitation shared response guide');
    await expect(guestPage.getByRole('textbox', { name: 'Page title', exact: true })).toHaveAttribute('readonly', '');
    await accessible(guestPage, 'accepted guest has exactly named view access');
    const accepted = await snapshot();
    const created = accepted.members.filter(member => !pending.members.some(before => before.id === member.id));
    assert.deepEqual(created, [{ id: who.id, email: acceptedEmail, role: 'member', member_kind: 'guest', status: 'active' }]);
    assert.equal(accepted.invitations[0].accepted_by_member_id, who.id);
    assert.ok(accepted.grants.some(item => item.id === admitted.pending.id && item.principal_id === who.id && item.level === 'view' && item.revoked_at === null));
    const sessions = accepted.sessions.filter(session => !pending.sessions.some(before => before.id === session.id));
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].member_id, who.id);
    await refuse(admitted.link);

    const cancelled = await send(cancelledEmail);
    await page.locator('.grant-list > li').filter({ hasText: cancelledEmail }).locator('summary').click();
    await page.locator('.grant-list > li').filter({ hasText: cancelledEmail }).getByRole('button', { name: 'Remove access', exact: true }).click();
    await expect(page.locator('.grant-list > li').filter({ hasText: cancelledEmail })).toContainText('Revoked');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.right').getByRole('heading', { name: 'Share this page', exact: true })).toBeVisible();
    await expect(page.locator('.grant-list > li').filter({ hasText: cancelledEmail })).toContainText('revoked invitation');
    await accessible(page, 'removed pending invitation stays visibly revoked');
    const revoked = await snapshot();
    const retained = revoked.invitations.find(item => item.id === cancelled.pending.invitationId);
    assert.ok(retained.revoked_at, 'Cancellation retains the revoked invitation.');
    assert.equal(retained.accepted_by_member_id, null);
    assert.equal(retained.page_grant_id, cancelled.pending.id);
    assert.ok(!revoked.members.some(member => member.email === cancelledEmail));
    assert.deepEqual(revoked.members, accepted.members);
    assert.deepEqual(revoked.sessions, accepted.sessions, 'Accepted-token replay and cancellation create no extra session.');
    assert.ok(revoked.grants.find(item => item.id === cancelled.pending.id).revoked_at);
    const mailBeforeReplay = await inbox(origin);
    await refuse(cancelled.link);
    await ok(context, origin, 'POST', '/api/invitations', cancelled.request);
    await refuse(cancelled.link);
    const replayed = await snapshot();
    assert.deepEqual(replayed, revoked, 'Replaying the capture cannot restore the grant, invitation, member or session.');
    assert.equal((await inbox(origin)).length, mailBeforeReplay.length, 'Invitation replay sends no new token.');
    const grants = await api(`/api/sharing/pages/${shared}`);
    assert.equal(grants.items.find(item => item.id === cancelled.pending.id).status, 'revoked');
    assert.ok(!grants.effectiveItems.some(item => item.id === cancelled.pending.id));
    await switchIdentity('owner');
    assert.deepEqual(await api('/api/members'), membersBefore, 'Guest admission leaves workspace membership unchanged.');
    console.log(`PROBE SHARE-006 acceptance 1–2: non-owner Share → Invite by email -> pending persisted grant, native guest acceptance with view only, retained cancellation and replay refusal; width=${width}`);
  } finally {
    await guest.close();
    await switchIdentity('owner');
  }
}
