import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { grant, ok, restrictedPage } from './two-people-support.mjs';
import { openPageAction } from './browser-support.mjs';

/** Direct mentions use the same native sessions and inbox as group mentions. */
export async function commentMentionsJourney(state, people) {
  const { origin } = state, { alice, bob } = people;
  const { pageId } = await restrictedPage(state, 'Escalation ownership', ['Confirm the next shift owner before handover.']);
  const mention = { text: bob.name, mention: { kind: 'person', id: bob.id, label: bob.name } };
  const request = { operationKey: randomUUID(), body: [{ text: 'Please review, ' }, mention, { text: ' and ' }, mention] };
  const created = await ok(alice.context, origin, 'POST', `/api/comments/page/${pageId}`, request);
  const mentions = async () => (await ok(bob.context, origin, 'GET', '/api/notifications')).items.filter(item => item.event === 'mention' && item.pageId === pageId);
  assert.deepEqual(await mentions(), [], 'A person without page access is never notified.');
  await grant(alice.context, origin, pageId, bob.id, 'comment');
  await ok(alice.context, origin, 'POST', `/api/comments/page/${pageId}`, request);
  assert.deepEqual(await mentions(), [], 'Replaying a capture after access is granted cannot send a formerly refused mention.');
  let comments = await ok(alice.context, origin, 'GET', `/api/comments/page/${pageId}`);
  let comment = comments.comments.find(item => item.id === created.value.id);
  await ok(alice.context, origin, 'PATCH', `/api/comments/${comment.id}`, { operationKey: randomUUID(), expectedRevisionId: comment.revisionId, body: [...request.body, { text: ' Check the rota.' }] });
  assert.deepEqual(await mentions(), [], 'Editing around an old mention does not turn it into a new mention.');

  // Start without a mention, then add it using the comment editor.
  const plain = (await ok(alice.context, origin, 'POST', `/api/comments/page/${pageId}`, { operationKey: randomUUID(), body: [{ text: 'Who takes the next shift?' }] })).value.id;
  await alice.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await openPageAction(alice.page, 'Comments');
  const article = alice.page.locator(`#comment-${plain}`);
  await article.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = alice.page.getByRole('textbox', { name: 'Edit comment text', exact: true });
  await editor.fill('Please confirm, ');
  await editor.press('End');
  await alice.page.keyboard.press('@');
  await alice.page.keyboard.type(bob.name);
  await alice.page.getByRole('listbox', { name: 'Insert mention', exact: true }).getByRole('option', { name: `${bob.name} · Person`, exact: true }).click();
  await alice.page.getByRole('button', { name: 'Save comment', exact: true }).click();
  await expect(article).toContainText(`@${bob.name}`);
  const delivered = await mentions();
  assert.equal(delivered.length, 1, 'The new mention creates exactly one notification.');
  assert.equal(delivered[0].readAt, null, 'A new mention is unread.');
  assert.equal(delivered[0].commentId, plain);
  assert.equal(new URL(delivered[0].href, origin).searchParams.get('comment'), plain);
  await bob.page.goto(`${origin}/app/inbox`, { waitUntil: 'networkidle' });
  const notice = bob.page.locator('.outcome-list li').filter({ hasText: 'Escalation ownership' }).filter({ has: bob.page.locator('.outcome-kind').filter({ hasText: /^mention\b/ }) });
  await expect(notice).toHaveCount(1);
  await people.shot('bob', 'unread person mention');
  await notice.getByRole('button', { name: /Escalation ownership/ }).click();
  await expect(bob.page).toHaveURL(new RegExp(`comment=${plain}`));
  await expect(bob.page.locator(`#comment-${plain}`)).toContainText(`@${bob.name}`);
  await people.shot('bob', 'mention opens its comment');

  comments = await ok(alice.context, origin, 'GET', `/api/comments/page/${pageId}`);
  comment = comments.comments.find(item => item.id === plain);
  const editRequest = { operationKey: randomUUID(), expectedRevisionId: comment.revisionId, body: [...comment.body, { text: ' Please check today.' }, mention] };
  await ok(alice.context, origin, 'PATCH', `/api/comments/${plain}`, editRequest);
  await ok(alice.context, origin, 'PATCH', `/api/comments/${plain}`, editRequest);
  assert.deepEqual((await mentions()).map(item => item.id), delivered.map(item => item.id), 'Retained and repeated mentions, including a replay, do not notify again.');
  const grants = await ok(alice.context, origin, 'GET', `/api/sharing/pages/${pageId}`);
  const access = grants.items.find(item => item.principalId === bob.id);
  await grant(alice.context, origin, pageId, bob.id, 'comment', { id: access.id, revoke: true });
  assert.deepEqual(await mentions(), [], 'Revoked page access hides earlier mention notifications.');
}
