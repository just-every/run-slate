import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible } from './browser-support.mjs';
import { ok } from './two-people-support.mjs';

const title = 'Vendor renewal';
const localDate = instant => [instant.getFullYear(), String(instant.getMonth() + 1).padStart(2, '0'), String(instant.getDate()).padStart(2, '0')].join('-');

/**
 * BLOCK-015 in two browsers: Alex types a task, assigns it to Morgan with `@`
 * (sharing the page when asked, since Morgan cannot read it yet) and dates it
 * with `//`. Morgan gets one inbox item and, once the due date has passed,
 * sees the task as overdue.
 */
export async function taskAssignmentJourney(state, people) {
  const { alice, bob } = people, origin = state.origin;
  const space = (await ok(alice.context, origin, 'POST', '/api/containers', { operationKey: randomUUID(), name: 'Vendor desk', visibility: 'closed' })).value.id;
  const pageId = (await ok(alice.context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: space, title })).value.pageId;
  const task = async () => (await ok(alice.context, origin, 'GET', `/api/pages/${pageId}`)).blocks.find(block => block.blockType === 'task')?.content;

  await alice.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await alice.page.getByRole('textbox', { name: 'Page body', exact: true }).click();
  await alice.page.keyboard.type('[] ');
  const item = alice.page.getByRole('textbox', { name: 'To-do item', exact: true });
  await expect(item).toHaveCount(1);
  await item.click();
  await alice.page.keyboard.type('Renew the vendor contract ');
  await alice.page.keyboard.press('@');
  const picker = alice.page.getByRole('dialog', { name: 'Insert mention', exact: true });
  await picker.getByLabel('Find a person, group or page').fill('Morgan');
  await picker.getByRole('button', { name: 'Morgan Reader · Person', exact: true }).click();
  const prompt = alice.page.getByRole('dialog', { name: 'Share before assigning', exact: true });
  await expect(prompt).toContainText('Morgan Reader cannot read this page.');
  assert.equal((await ok(bob.context, origin, 'GET', '/api/notifications')).items.filter(entry => entry.pageId === pageId).length, 0, 'Nothing reaches a member who cannot read the page.');
  await people.shot('alice', 'share before assigning');
  await prompt.getByRole('button', { name: 'Share page and assign', exact: true }).click();
  await expect(prompt).toBeHidden();
  await expect(alice.page.getByRole('combobox', { name: 'Task assignee', exact: true })).toHaveValue(bob.id);
  await expect.poll(async () => (await task())?.assigneeMemberId).toBe(bob.id);
  await expect(item).toContainText('Morgan Reader');

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const due = localDate(tomorrow);
  // The caret goes after the mention; End alone stops at the visual line end when a phone width wraps the item.
  await item.evaluate(element => { element.focus(); const range = document.createRange(); range.selectNodeContents(element); range.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(range); });
  await alice.page.keyboard.type('//');
  const picked = alice.page.getByLabel('Task due date', { exact: true });
  await expect(picked).toBeVisible();
  await picked.fill(due);
  await expect.poll(async () => (await task())?.dueDate).toBe(due);
  const dated = alice.page.locator('[data-task-item] time');
  await expect(dated).toHaveAttribute('datetime', due);
  await expect(dated).not.toContainText('Overdue');
  await expect(item).not.toContainText('//');
  await accessible(alice.page, 'assigned and dated task');
  await people.shot('alice', 'task assigned and dated');

  await bob.page.goto(`${origin}/app/inbox`, { waitUntil: 'networkidle' });
  const notices = bob.page.locator('.outcome-list li').filter({ hasText: title }).filter({ has: bob.page.locator('.outcome-kind').filter({ hasText: /^task assigned\b/ }) });
  await expect(notices).toHaveCount(1);
  assert.equal((await ok(bob.context, origin, 'GET', '/api/notifications')).items.filter(entry => entry.event === 'task-assigned' && entry.pageId === pageId).length, 1);
  await people.shot('bob', 'task assigned notice');

  // Morgan's own clock moves past the due date; the overdue state is the reader's local date.
  await bob.page.clock.setFixedTime(new Date(Date.now() + 3 * 86400000));
  await bob.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const overdue = bob.page.locator('[data-task-item][data-task-overdue]');
  await expect(overdue).toHaveCount(1);
  await expect(overdue.locator('time')).toContainText('Overdue · ');
  await expect(overdue.locator('time')).toHaveAttribute('datetime', due);
  await people.shot('bob', 'task overdue');
}
