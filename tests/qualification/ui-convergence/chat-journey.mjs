import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible } from './browser-evidence.mjs';
import { ok } from './two-people-support.mjs';

/** NOTIF-003: owner token setup, actual comment events and production cron, Slack HTTP edge only. */
export async function chatJourney(state, width = state.page.viewportSize().width) {
  const { page, context, origin, runScheduled, atRest, setSlackFailure, readSlackMessages } = state;
  const api = (method, route, data) => ok(context, origin, method, route, data);
  const evidence = path.join(root, '.artifacts/ui-convergence/chat');
  await mkdir(evidence, { recursive: true });
  const shot = async label => {
    await accessible(page, `chat ${label}`);
    await page.screenshot({ path: path.join(evidence, `chat-${width}-${label}.png`), fullPage: true });
  };
  const open = async () => {
    await page.goto(`${origin}/app/settings?section=chat`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Send updates to Slack.', exact: true })).toBeVisible();
  };
  const status = page.getByRole('region', { name: 'Slack delivery status', exact: true });
  const save = async () => {
    await page.getByLabel('Slack bot token', { exact: true }).fill('TEST-ONLY-SLACK-BOT-TOKEN');
    await page.getByRole('button', { name: 'Save chat delivery', exact: true }).click();
    await expect(status.getByRole('status')).toHaveText('Connected');
  };
  const space = (await api('GET', '/api/containers')).items.find(item => item.name === 'Handbook');
  const body = 'PRIVATE-CHAT-BODY-SENTINEL';
  const pageId = (await api('POST', '/api/pages', { operationKey: randomUUID(), containerId: space.id, title: 'Slack delivery runbook',
    blocks: [{ id: randomUUID(), blockType: 'paragraph', treePosition: 'a0', content: { text: [{ text: body }] } }] })).value.pageId;
  await api('POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: 'browser-reader', level: 'view' });
  const comment = extra => api('POST', `/api/comments/page/${pageId}`, { operationKey: randomUUID(), body: [{ text: body }], ...extra });
  const history = async () => (await api('GET', '/api/notifications/chat/deliveries')).items;
  const count = async () => (await readSlackMessages()).length;

  await open();
  await expect(page.getByText('No chat delivery is connected.', { exact: true })).toBeVisible();
  await shot('not-connected');
  await page.getByLabel('Private channel ID', { exact: true }).fill('GTEST');
  await page.getByRole('checkbox', { name: 'comment', exact: true }).check();
  await page.getByRole('checkbox', { name: 'mention', exact: true }).check();
  await save();
  await shot('connected');
  const first = await comment();
  await comment({ body: [{ text: 'Morgan Reader', mention: { kind: 'person', id: 'browser-reader', label: 'Morgan Reader' } }] });
  await runScheduled();
  await expect.poll(count).toBe(3);
  const sent = await readSlackMessages();
  assert.deepEqual(sent.map(item => item.text.split(' · ')[0]).sort(), ['comment', 'comment', 'mention']);
  for (const item of sent) {
    assert.equal(item.accepted, true);
    assert.ok(item.text.includes('Alex Owner') && item.text.includes('Slack delivery runbook') && item.text.includes(`/app/pages/${pageId}`));
    assert.equal(JSON.stringify(item).includes(body), false);
  }
  await comment({ threadId: first.value.threadId, parentCommentId: first.value.id });
  await runScheduled();
  assert.equal(await count(), 3, 'Unselected replies do not reach Slack.');
  await open();
  await expect(status).toContainText('Last delivered:');
  await shot('delivered');

  await setSlackFailure('rate_limited');
  await comment(); await runScheduled();
  assert.equal(await count(), 4);
  await open(); await expect(status).toContainText('rate_limited');
  await shot('transient-failure');
  await setSlackFailure('ok'); await runScheduled();
  assert.equal(await count(), 4, 'Retry waits for its scheduled time.');
  await atRest("UPDATE chat_deliveries SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE state='pending'");
  await runScheduled(); assert.equal(await count(), 5);
  assert.equal((await history()).filter(item => item.state === 'delivered').length, 4);
  await open(); await expect(status).toContainText('Last delivered:');
  await shot('retry-delivered');

  await setSlackFailure('channel_not_found');
  await comment(); await runScheduled();
  const permanentCount = await count();
  await setSlackFailure('ok'); await runScheduled();
  assert.equal(await count(), permanentCount, 'Permanent failure is not retried.');
  await open(); await expect(status).toContainText('channel_not_found');
  await shot('permanent-failure');
  await setSlackFailure('token_revoked');
  await comment(); await runScheduled();
  await open(); await expect(status.getByRole('status')).toHaveText('Needs attention');
  await shot('needs-attention');
  const retained = await history(), stoppedCount = await count();
  await comment(); await runScheduled();
  assert.equal(await count(), stoppedCount, 'Revoked authorization stops further sends.');
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  for (const name of ['comment', 'mention']) await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
  await expect(page.getByLabel('Slack bot token', { exact: true })).toHaveValue('');
  await shot('reconnect-form');
  await setSlackFailure('ok'); await save();
  assert.deepEqual(await history(), retained, 'Reconnect preserves delivery history.');
  await shot('reconnected');
  await page.getByRole('button', { name: 'Disconnect delivery', exact: true }).click();
  await expect(status.getByRole('status')).toHaveText('Disconnected');
  await shot('disconnected');
  await comment(); await runScheduled();
  assert.equal(await count(), stoppedCount, 'Disconnect stops all further messages.');
}
