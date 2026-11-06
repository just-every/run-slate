import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { inbox, newOutboxLink } from '../../e2e/outbox-auth.mjs';
import { accessible } from './browser-evidence.mjs';
import { call, ok, grant } from './two-people-support.mjs';

/** Native sessions, published pages, explicit consent and durable inbox readback. */
export async function shareMessageJourney(state) {
  const { page, context, origin, api } = state, key = () => randomUUID();
  const evidence = path.join(root, '.artifacts/ui-convergence/share-message');
  await mkdir(evidence, { recursive: true });
  const third = await context.browser().newContext({ viewport: page.viewportSize() });
  const reader = await context.browser().newContext({ viewport: page.viewportSize() });
  await reader.addCookies([{ name: 'slate_session', value: state.readerCookie.split('=')[1], url: origin }]);
  const captures = [], probes = [];
  try {
    const beforeMail = await inbox(origin);
    await ok(context, origin, 'POST', '/api/invitations', { operationKey: key(), email: ['synthetic-slate-message', 'test.invalid'].join('@'), kind: 'member' });
    const link = new URL(await newOutboxLink(origin, beforeMail));
    assert.equal((await third.request.post(origin + '/api/auth/invitation/accept', { headers: { origin }, form: { token: link.searchParams.get('token') }, maxRedirects: 0 })).status(), 303);
    const person = await ok(third, origin, 'GET', '/api/members/current');
    assert.equal(person.memberKind, 'member');
    await ok(third, origin, 'PUT', `/api/people/${person.id}`, { operationKey: key(), expectedRevisionId: null, displayName: 'Casey Member' });
    const space = (await ok(context, origin, 'POST', '/api/containers', { operationKey: key(), name: 'Message sharing team', visibility: 'private' })).value.id;
    const create = async title => {
      const id = (await ok(context, origin, 'POST', '/api/pages', { operationKey: key(), containerId: space, title, blocks: [{ id: key(), blockType: 'paragraph', content: { text: [{ text: 'The page body stays separate from the message.' }] }, treePosition: '0' }] })).value.pageId;
      await grant(context, origin, id, 'browser-owner', 'full');
      await ok(context, origin, 'PUT', `/api/sharing/pages/${id}/inheritance`, { operationKey: key(), expectedRevisionId: (await api(`/api/pages/${id}`)).page.revisionId, restricted: true });
      await ok(context, origin, 'POST', `/api/pages/${id}/publish`, { operationKey: key(), expectedRevisionId: (await api(`/api/pages/${id}`)).page.revisionId });
      return id;
    };
    const target = await create('Published message recipient guide');
    await grant(context, origin, target, 'browser-reader', 'view');
    const route = `/api/sharing/pages/${target}/messages`;
    const grants = () => api(`/api/sharing/pages/${target}`);
    const notices = ctx => ok(ctx, origin, 'GET', '/api/notifications?limit=100');
    const activity = async () => (await api('/api/activity?action=sharing.message&limit=100')).items.filter(item => item.target.id === target);
    const body = async () => {
      const doc = await api(`/api/pages/${target}`);
      return { page: doc.page, blocks: doc.blocks, workingRevisionId: doc.workingRevisionId, publishedRevisionId: doc.publishedRevisionId };
    };
    const original = { grants: await grants(), reader: await notices(reader), third: await notices(third), activity: await activity(), body: await body() };
    assert.equal((await call(reader, origin, 'GET', `/api/pages/${target}`)).status, 200);
    assert.equal((await call(third, origin, 'GET', `/api/pages/${target}`)).status, 404);
    await page.goto(`${origin}/app/pages/${target}?detail=share`, { waitUntil: 'networkidle' });
    const panel = page.getByRole('region', { name: 'Send a page', exact: true });
    const message = 'Please review this handover.\n<plain text> & keep the page unchanged.';
    await panel.getByRole('checkbox', { name: 'Morgan Reader', exact: true }).check();
    await panel.getByRole('checkbox', { name: 'Casey Member', exact: true }).check();
    await panel.getByRole('textbox', { name: 'Message (optional)', exact: true }).fill(message);
    const seed = JSON.parse(await readFile(path.join(root, 'seed.json'), 'utf8'));
    await expect(panel.getByRole('textbox')).toHaveAttribute('maxlength', String(seed.limits.shareMessageCharacters));
    await panel.getByRole('button', { name: 'Review message', exact: true }).click();
    const review = panel.getByRole('region', { name: 'Review message', exact: true });
    await expect(review).toContainText('Morgan Reader can already read this page.');
    await expect(review).toContainText('Casey Member cannot read this page.');
    await expect(review).toContainText('Nothing has been sent.');
    assert.deepEqual(await grants(), original.grants);
    assert.deepEqual(await notices(reader), original.reader);
    assert.deepEqual(await notices(third), original.third);
    assert.deepEqual(await activity(), original.activity);
    await panel.getByRole('button', { name: 'Cancel message', exact: true }).click();
    await expect(review).toHaveCount(0);
    assert.deepEqual(await grants(), original.grants, 'Cancel never adds authority.');
    assert.deepEqual(await notices(third), original.third, 'Cancel never sends anything.');
    const input = { operationKey: key(), memberIds: ['browser-reader', person.id], message, grantMemberIds: [] };
    const refused = await call(context, origin, 'POST', route, input);
    assert.equal(refused.status, 409); assert.equal(refused.body.code, 'ACCESS_GRANT_REQUIRED');
    for (const grantMemberIds of [[person.id, person.id], ['browser-owner']]) {
      const invalidConsent = await call(context, origin, 'POST', route, { ...input, operationKey: key(), grantMemberIds });
      assert.equal(invalidConsent.status, 400);
      assert.equal(invalidConsent.body.code, 'INVALID_GRANT_CONSENT');
    }
    const tooLong = await call(context, origin, 'POST', route, { ...input, operationKey: key(), message: 'x'.repeat(seed.limits.shareMessageCharacters + 1), grantMemberIds: [person.id] });
    assert.equal(tooLong.status, 400, 'The server enforces the named message limit independently of the browser.');
    assert.equal((await call(context, origin, 'POST', route, { ...input, operationKey: key(), memberIds: ['browser-reader', 'browser-reader'] })).status, 400);
    assert.deepEqual(await grants(), original.grants);
    assert.deepEqual(await notices(reader), original.reader);
    assert.deepEqual(await notices(third), original.third);
    assert.deepEqual(await activity(), original.activity);
    probes.push('PROBE SHARE-009 consent: native review, cancel and unaccepted grant -> no grant, message or activity; over-limit send -> 400');

    await panel.getByRole('button', { name: 'Review message', exact: true }).click();
    await expect(review).toBeVisible();
    await panel.getByRole('button', { name: 'Add View access and send', exact: true }).scrollIntoViewIfNeeded();
    await accessible(page, 'share message reviewed before explicit consent');
    // Hold only transport: the emitted Worker commits the real grant, message
    // and activity before its successful response is deliberately lost.
    const sendButton = panel.getByRole('button', { name: 'Add View access and send', exact: true });
    const matches = url => url.pathname === route;
    let interrupted, committed, firstCapture;
    const hold = request => { interrupted = request; };
    await page.route(matches, hold);
    try {
      await sendButton.click();
      await expect.poll(() => !!interrupted).toBe(true);
      await expect(sendButton).toBeDisabled();
      await expect(panel.getByRole('button', { name: 'Cancel message', exact: true })).toBeDisabled();
      assert.deepEqual(await grants(), original.grants);
      assert.deepEqual(await notices(reader), original.reader);
      assert.deepEqual(await notices(third), original.third);
      assert.deepEqual(await activity(), original.activity);
      const result = await interrupted.fetch({ maxRetries: 0 });
      assert.equal(result.status(), 200, await result.text());
      committed = await result.json();
      firstCapture = interrupted.request().postDataJSON();
      await interrupted.abort('connectionfailed');
      interrupted = undefined;
      await expect(panel.getByRole('alert')).toContainText('Current server state is unconfirmed.');
      await expect(panel.getByRole('status')).toHaveCount(0);
      await expect(review).toContainText(message);
      await expect(sendButton).toBeEnabled();
    } finally {
      await interrupted?.abort().catch(() => {});
      await page.unroute(matches, hold);
    }
    const beforeRetry = { grants: await grants(), reader: await notices(reader), third: await notices(third), activity: await activity() };
    assert.equal(beforeRetry.activity.length, 1, 'The interrupted response followed a real commit.');
    assert.equal(beforeRetry.activity[0].id, committed.receipt.activityId);
    const submitted = page.waitForResponse(response => new URL(response.url()).pathname === route && response.request().method() === 'POST');
    await sendButton.click();
    const response = await submitted;
    assert.equal(response.status(), 200, await response.text());
    const captured = response.request().postDataJSON(), receipt = await response.json();
    assert.deepEqual(captured, firstCapture, 'Retry retains the reviewed recipients, message, consent and operation key.');
    assert.deepEqual(receipt, committed, 'The retry recovers the exact native committed receipt.');
    assert.deepEqual({ grants: await grants(), reader: await notices(reader), third: await notices(third), activity: await activity() }, beforeRetry, 'Retry adds no grant, inbox item or activity.');
    probes.push('PROBE SHARE-009 transport-replay: lose the real committed response, then retry in Share -> same capture and receipt; no duplicate grant, inbox item or activity');
    assert.deepEqual(captured.grantMemberIds, [person.id]);
    assert.deepEqual(captured.memberIds.sort(), ['browser-reader', person.id].sort());
    assert.equal(captured.message, message);
    await expect(panel.getByRole('status')).toHaveText('Page sent to the selected members.');
    const after = await grants();
    const added = after.items.filter(item => !original.grants.items.some(before => before.id === item.id));
    assert.equal(added.length, 1);
    assert.equal(added[0].principalId, person.id); assert.equal(added[0].level, 'view'); assert.equal(added[0].principalKind, 'member');
    assert.deepEqual(after.items.filter(item => item.id !== added[0].id), original.grants.items, 'The readable member receives no new or widened grant.');
    assert.deepEqual(await body(), original.body, 'Sending never changes any page or block bytes or revisions.');
    assert.deepEqual(await ok(context, origin, 'POST', route, captured), receipt, 'The same capture returns the same durable receipt.');
    const rows = await activity();
    assert.equal(rows.length, 1); assert.equal(rows[0].id, receipt.receipt.activityId);
    assert.equal(rows[0].operationKey, captured.operationKey); assert.equal(rows[0].actor.id, 'browser-owner'); assert.equal(rows[0].shareMessage, message);
    assert.equal((await notices(third)).items.length, original.third.items.length + 1, 'Accepting the grant emits exactly one message item, without another grant notice.');
    for (const ctx of [reader, third]) {
      const items = (await notices(ctx)).items.filter(item => item.pageId === target && item.event === 'share-message');
      assert.equal(items.length, 1);
      assert.equal(items[0].title, 'Published message recipient guide');
      assert.equal(items[0].detail.shareMessage.message, message);
      assert.deepEqual(items[0].detail.shareMessage.sender, { id: 'browser-owner', displayName: 'Alex Owner' });
      assert.equal(items[0].href, `/app/pages/${target}`);
      assert.equal(JSON.stringify(items).includes('The page body stays separate'), false);
      const view = await ctx.newPage();
      try {
        await view.goto(origin + '/app/inbox', { waitUntil: 'networkidle' });
        const notice = view.locator('.outcome-list > li').filter({ hasText: message });
        await expect(notice).toHaveCount(1);
        await expect(notice).toContainText('From Alex Owner');
        await expect(notice).toContainText('Published message recipient guide');
        await expect(notice.locator('plain'), 'The plain-text message never becomes markup.').toHaveCount(0);
        await view.reload({ waitUntil: 'networkidle' });
        await expect(notice).toHaveCount(1);
        await expect(notice).toContainText(message);
        await expect(notice).toContainText('From Alex Owner');
        await expect(notice.getByRole('link')).toHaveAttribute('href', `/app/pages/${target}`);
        if (ctx === third) {
          await accessible(view, 'share message accepted grant inbox');
          await notice.getByRole('link').click();
          await view.waitForURL(url => url.pathname === `/app/pages/${target}`);
          await expect(view.locator('[data-page-editor]')).toContainText('The page body stays separate from the message.');
          await expect(view.locator('[data-page-editor]')).not.toContainText(message);
        }
      } finally { await view.close(); }
      assert.equal(JSON.stringify(await ok(ctx, origin, 'GET', '/api/activity?action=sharing.message')).includes(message), false, 'The retained activity message belongs only to its sender.');
    }
    await page.goto(origin + '/app/settings/activity', { waitUntil: 'networkidle' });
    const entry = page.locator(`[data-activity-id="${receipt.receipt.activityId}"]`);
    await expect(entry).toContainText(message); await page.reload({ waitUntil: 'networkidle' }); await expect(entry).toContainText(message);
    captures.push({ pageId: target, receipt, interruptedReceipt: committed, firstCapture, retryCapture: captured, beforeRetry, grantsBefore: original.grants, grantsAfter: after, activity: rows, notifications: { reader: await notices(reader), addedMember: await notices(third) } });
    probes.push('PROBE SHARE-009 1: native published-page Share -> readable Morgan and unreadable Casey reviewed; explicit consent commits only Casey View grant');
    probes.push('PROBE SHARE-009 2-inbox: native inbox and reload -> exactly one plain-text message per recipient with sender, page title and link; unchanged page body');
    probes.push('PROBE SHARE-009 3: add-grant confirmation and exact capture replay -> one accepted grant, one item per recipient and one sender activity');

    await ok(context, origin, 'POST', '/api/sharing', { operationKey: key(), targetKind: 'page', targetId: target, id: added[0].id, principalKind: 'member', principalId: person.id, level: 'view', revoke: true });
    assert.equal((await notices(third)).items.some(item => item.pageId === target), false, 'Current revoked access hides the retained inbox item.');
    assert.deepEqual(await ok(context, origin, 'POST', route, captured), receipt);
    assert.ok((await grants()).items.find(item => item.id === added[0].id).revokedAt, 'A replay never restores a revoked recipient grant.');
    assert.equal((await notices(third)).items.some(item => item.pageId === target), false);
    assert.equal((await activity()).length, 1);
    assert.equal((await call(reader, origin, 'POST', route, { ...captured, operationKey: key() })).status, 404, 'A read-only member cannot send or grant.');
    assert.deepEqual(await body(), original.body);
    probes.push('PROBE SHARE-009 current-access: revoke Casey then replay -> grant remains revoked and inbox empty; read-only send -> 404');

    // Independent published source: the ordinary member can send, then loses
    // full authority. Its saved capture cannot send or add access afterward.
    const second = await create('Independent message authority guide');
    await grant(context, origin, second, person.id, 'full');
    const secondReaderGrant = await grant(context, origin, second, 'browser-reader', 'view');
    const other = await third.newPage();
    let secondReceipt, secondCapture;
    try {
      await other.goto(`${origin}/app/pages/${second}?detail=share`, { waitUntil: 'networkidle' });
      const send = other.getByRole('region', { name: 'Send a page', exact: true });
      await send.getByRole('checkbox', { name: 'Morgan Reader', exact: true }).check();
      await send.getByRole('button', { name: 'Review message', exact: true }).click();
      await ok(context, origin, 'POST', '/api/sharing', { operationKey: key(), targetKind: 'page', targetId: second, id: secondReaderGrant.value.id, principalKind: 'member', principalId: 'browser-reader', level: 'view', revoke: true });
      const beforeDrift = await api(`/api/sharing/pages/${second}`);
      const driftResponse = other.waitForResponse(response => new URL(response.url()).pathname === `/api/sharing/pages/${second}/messages`);
      await send.getByRole('button', { name: 'Send page', exact: true }).click();
      assert.equal((await driftResponse).status(), 409, 'Access lost since review requires fresh explicit consent.');
      await expect(send.getByRole('alert')).toContainText('Review current access');
      assert.deepEqual(await api(`/api/sharing/pages/${second}`), beforeDrift);
      assert.equal((await notices(reader)).items.some(item => item.pageId === second), false);
      assert.equal((await api('/api/activity?action=sharing.message&limit=100')).items.some(item => item.target.id === second), false);
      await send.getByRole('button', { name: 'Cancel message', exact: true }).click();
      await send.getByRole('button', { name: 'Review message', exact: true }).click();
      await expect(send.getByRole('region', { name: 'Review message', exact: true })).toContainText('Morgan Reader cannot read this page.');
      // Phone proof is readback of this independent published source. The
      // functional assertions run at desktop width in the existing registration.
      await other.setViewportSize({ width: 390, height: 844 });
      await send.getByRole('button', { name: 'Add View access and send', exact: true }).scrollIntoViewIfNeeded();
      await accessible(other, 'share message phone review on independent published page');
      await other.setViewportSize({ width: 1440, height: 1000 });
      const sent = other.waitForResponse(response => new URL(response.url()).pathname === `/api/sharing/pages/${second}/messages`);
      await send.getByRole('button', { name: 'Add View access and send', exact: true }).click();
      const res = await sent; assert.equal(res.status(), 200);
      secondCapture = res.request().postDataJSON(); secondReceipt = await res.json();
      assert.equal(secondCapture.message, '', 'A message is optional.');
      const readerPage = await reader.newPage();
      try {
        await readerPage.goto(origin + '/app/inbox', { waitUntil: 'networkidle' });
        const notice = readerPage.locator('.outcome-list > li').filter({ hasText: 'Independent message authority guide' }).filter({ hasText: 'From Casey Member' });
        await expect(notice).toContainText('From Casey Member');
        await readerPage.setViewportSize({ width: 390, height: 844 });
        await accessible(readerPage, 'share message phone inbox readback on independent published page');
      } finally { await readerPage.close(); }
      const beforeAuthority = await api(`/api/sharing/pages/${second}`);
      const ownGrant = beforeAuthority.items.find(item => item.principalId === person.id && item.level === 'full');
      await ok(context, origin, 'POST', '/api/sharing', { operationKey: key(), targetKind: 'page', targetId: second, id: ownGrant.id, principalKind: 'member', principalId: person.id, level: 'full', revoke: true });
      const snapshot = await api(`/api/sharing/pages/${second}`), readerBefore = await notices(reader);
      assert.equal((await call(third, origin, 'POST', `/api/sharing/pages/${second}/messages`, secondCapture)).status, 404);
      assert.equal((await call(third, origin, 'POST', `/api/sharing/pages/${second}/messages`, { ...secondCapture, operationKey: key() })).status, 404);
      assert.deepEqual(await api(`/api/sharing/pages/${second}`), snapshot); assert.deepEqual(await notices(reader), readerBefore);
      await other.goto('about:blank');
    } finally { await other.close(); }
    await ok(context, origin, 'POST', '/api/members/remove', { operationKey: key(), memberId: person.id, erase: true });
    assert.equal((await call(third, origin, 'POST', `/api/sharing/pages/${second}/messages`, secondCapture)).status, 401);
    assert.equal((await notices(reader)).items.some(item => item.pageId === second && item.event === 'share-message'), false, 'Sender erasure removes their message from recipient inboxes.');
    const erasedActivity = (await api('/api/activity?action=sharing.message&limit=100')).items.find(item => item.id === secondReceipt.receipt.activityId);
    assert.equal(erasedActivity.actor, null); assert.equal(erasedActivity.shareMessage, undefined);
    probes.push('PROBE SHARE-009 recipient-drift: native access lost after review -> 409 with no grant, notice or activity; fresh review requires explicit View consent');
    probes.push('PROBE SHARE-009 erasure-and-authority: full-member send succeeds; revoked sender replay -> 404 unchanged; erased sender replay -> 401 and recipient message removed');
    await writeFile(path.join(evidence, 'receipt.json'), JSON.stringify({ sessions: [{ id: 'browser-owner', role: 'owner' }, { id: 'browser-reader', role: 'member' }, { id: person.id, role: 'member', nativeInvitationAccepted: true, erased: true }], captures, secondReceipt, probes }, null, 2));
    for (const line of probes) console.log(line);
  } finally { await third.close(); await reader.close(); }
}
