import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible } from './browser-evidence.mjs';
import { ok } from './two-people-support.mjs';

/**
 * DB-015: Alex saves a weekly template, so the Templates tab says it runs as Alex. Morgan, given edit access,
 * saves it again, and both people then read that it runs as Morgan: the label names the last saver, never the creator.
 */
export async function recordTemplatesJourney(state, people) {
  const { origin } = state, { alice, bob } = people;
  const width = alice.page.viewportSize().width;
  const shot = (view, label) => view.screenshot({ path: path.join(root, `.artifacts/ui-convergence/record-templates-${width}-${label}.png`), fullPage: true });
  const space = (await ok(alice.context, origin, 'GET', '/api/containers')).items.find(item => item.name === 'Handbook');
  await ok(alice.context, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: bob.id, level: 'edit' });
  const database = (await ok(alice.context, origin, 'POST', '/api/databases', { operationKey: randomUUID(), containerId: space.id, title: 'Team syncs' })).value;
  const saved = (await ok(alice.context, origin, 'POST', `/api/databases/${database.id}/templates`, {
    operationKey: randomUUID(), name: 'Weekly sync', title: 'Weekly sync notes', values: {}, blocks: [], recurrence: { frequency: 'weekly', weekdays: [1, 3], time: '09:00' },
  })).value;
  const card = view => view.locator('.record-template-list > li').filter({ has: view.getByRole('heading', { name: 'Weekly sync', exact: true }) });
  const open = async view => {
    await view.goto(`${origin}/app/databases/${database.id}`, { waitUntil: 'networkidle' });
    await view.getByRole('button', { name: 'Templates', exact: true }).click();
    await expect(card(view)).toBeVisible();
  };

  await open(alice.page);
  await expect(card(alice.page)).toContainText('runs as Alex Owner');
  await expect(card(alice.page)).not.toContainText('created as');
  await accessible(alice.page, 'record template runs as the saver');
  await shot(alice.page, 'runs-as-alex');

  await open(bob.page);
  await expect(card(bob.page)).toContainText('runs as Alex Owner');
  await card(bob.page).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = bob.page.getByRole('dialog', { name: 'Edit Weekly sync', exact: true });
  await dialog.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(card(bob.page)).toContainText('runs as Morgan Reader');
  await accessible(bob.page, 'record template re-saved by a second person');
  await shot(bob.page, 'runs-as-morgan');

  await open(alice.page);
  await expect(card(alice.page)).toContainText('runs as Morgan Reader');
  await shot(alice.page, 'handed-to-morgan');
  const listed = (await ok(alice.context, origin, 'GET', `/api/databases/${database.id}/templates`)).items.find(item => item.id === saved.id);
  assert.deepEqual(listed.lastSaver, { id: bob.id, name: 'Morgan Reader' });
  assert.deepEqual(listed.creator, listed.lastSaver, 'The old creator field still answers with the last saver for existing clients.');
}
