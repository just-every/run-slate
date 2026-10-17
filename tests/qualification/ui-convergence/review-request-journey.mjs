import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible } from './browser-support.mjs';
import { grant, ok } from './two-people-support.mjs';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/** The owner names Morgan as reviewer from the page's status panel. */
async function requestReview(page, origin, pageId, { date, note }) {
  await page.goto(`${origin}/app/pages/${pageId}?detail=status`, { waitUntil: 'networkidle' });
  const panel = page.getByRole('region', { name: 'Page review requests' });
  await panel.getByRole('button', { name: 'Request review', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request review' });
  await dialog.getByLabel('Reviewer').selectOption({ label: 'Morgan Reader' });
  await dialog.getByLabel('Due date').fill(date);
  await dialog.getByLabel('Due time').fill('09:00');
  await dialog.getByLabel('Timezone').fill('UTC');
  await dialog.getByLabel('Note').fill(note);
  await accessible(page, 'request review dialog');
  await dialog.getByRole('button', { name: 'Request review', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText(note)).toBeVisible();
}

const notices = async (view, origin, event) => (await ok(view.context, origin, 'GET', '/api/notifications')).items.filter(item => item.event === event);

/**
 * STAT-006 in two browsers: a named review reaches the reviewer's inbox and queue,
 * is verified on the exact revision the reviewer opened, and an overdue request
 * reminds the reviewer and then the container owner exactly once each.
 */
export async function reviewRequestJourney(state, people) {
  const { alice, bob } = people, origin = state.origin;
  const spaces = await ok(alice.context, origin, 'GET', '/api/containers');
  const space = spaces.items.find(item => item.name === 'Handbook');
  const pageId = (await ok(alice.context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: space.id, title: 'On-call runbook' })).value.pageId;
  await grant(alice.context, origin, pageId, bob.id, 'edit');
  // The fixture seeds identity, not the bootstrap vocabulary; the workspace owner adds the verifying status.
  if (!(await ok(alice.context, origin, 'GET', '/api/status')).items.some(entry => entry.requiresVerification)) {
    await ok(alice.context, origin, 'POST', '/api/status', { operationKey: randomUUID(), key: 'verified', label: 'Verified', color: '#228855', requiresVerification: true });
  }

  await requestReview(alice.page, origin, pageId, { date: day(2), note: 'Check the paging rota before Friday.' });
  await people.shot('alice', 'review requested');

  await bob.page.goto(`${origin}/app/inbox`, { waitUntil: 'networkidle' });
  await expect(bob.page.locator('.outcome-list li').filter({ hasText: 'review requested' }).filter({ hasText: 'On-call runbook' })).toHaveCount(1);
  await bob.page.goto(`${origin}/app/review`, { waitUntil: 'networkidle' });
  const queue = bob.page.getByRole('region', { name: 'Review requests' });
  await expect(queue.getByRole('button', { name: 'Assigned to me (1)' })).toBeVisible();
  const item = queue.locator('li').filter({ hasText: 'On-call runbook' });
  await expect(item).toContainText('Awaiting review · Morgan Reader · Requested by Alex Owner');
  await expect(item).toContainText('Check the paging rota before Friday.');
  await accessible(bob.page, 'reviewer queue');
  await people.shot('bob', 'reviewer queue');
  await item.getByRole('link', { name: 'Open current revision' }).click();
  await bob.page.waitForURL(url => url.pathname === `/app/pages/${pageId}`);
  await expect(bob.page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('On-call runbook');
  await bob.page.waitForLoadState('networkidle');
  await bob.page.goto(`${origin}/app/review`, { waitUntil: 'networkidle' });
  await queue.locator('li').filter({ hasText: 'On-call runbook' }).getByRole('button', { name: 'Verify review' }).click();
  const verify = bob.page.getByRole('dialog', { name: 'Verify this exact revision' });
  await expect(verify.getByText('The visit to this revision is not confirmed yet.')).toHaveCount(0);
  await verify.getByRole('button', { name: 'I reviewed this revision' }).click();
  await expect(verify).toBeHidden();
  await expect(queue.getByText('No review requests assigned to you.')).toBeVisible();
  const verified = (await ok(alice.context, origin, 'GET', `/api/status/page/${pageId}`)).verification;
  assert.equal(verified.verifier.id, bob.id, 'The reviewer is recorded as the verifier.');
  assert.equal(verified.state, 'current', 'The reviewer attested the revision now current.');
  await people.shot('bob', 'review verified');

  // An overdue request: the cron reminds the reviewer once, however often it runs.
  await requestReview(alice.page, origin, pageId, { date: day(-1), note: 'Overdue: confirm the escalation contacts.' });
  await state.runScheduled();
  await state.runScheduled();
  assert.equal((await notices(bob, origin, 'review-overdue')).length, 1);
  assert.equal((await notices(alice, origin, 'review-escalated')).length, 0, 'Container owners wait 24 hours after the reviewer reminder.');
  await bob.page.goto(`${origin}/app/inbox`, { waitUntil: 'networkidle' });
  await expect(bob.page.locator('.outcome-list li').filter({ hasText: 'review overdue' })).toHaveCount(1);
  await people.shot('bob', 'overdue reminder');
  // A day passes: the stored reminder time moves back rather than the test sleeping.
  await state.atRest(`UPDATE review_request_deliveries SET created_at='${new Date(Date.now() - 25 * 3600000).toISOString()}' WHERE stage='reviewer'`);
  await state.runScheduled();
  await state.runScheduled();
  assert.equal((await notices(alice, origin, 'review-escalated')).length, 1);
  assert.equal((await notices(bob, origin, 'review-overdue')).length, 1);
  await alice.page.goto(`${origin}/app/inbox`, { waitUntil: 'networkidle' });
  await expect(alice.page.locator('.outcome-list li').filter({ hasText: 'review escalated' }).filter({ hasText: 'On-call runbook' })).toHaveCount(1);
  await alice.page.goto(`${origin}/app/review`, { waitUntil: 'networkidle' });
  const requested = alice.page.getByRole('region', { name: 'Review requests' });
  await requested.getByRole('button', { name: /^Requested by me/ }).click();
  await expect(requested.locator('li').filter({ hasText: 'Overdue: confirm the escalation contacts.' })).toContainText(/Reviewer reminded .*Container owners reminded/);
  await accessible(alice.page, 'requested review queue after escalation');
  await people.shot('alice', 'owner escalation');
}
