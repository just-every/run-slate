import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { call } from '../../qualification/ui-convergence/two-people-support.mjs';

// Requirement names identify the starters; their author-written body copy is not pinned here.
const requiredStarters = [
  'Meeting notes', 'Retrospective', 'Decision', 'How-to', 'Troubleshooting',
  'Product requirements', 'Project plan', 'Runbook', 'Onboarding page', 'Team home', 'Policy page',
];

/** Run at the identity-only checkpoint in the existing first-run journey. */
export async function assertNoStarterTemplatesBeforeFirstRun({ api }) {
  const gallery = await api('/api/templates?category=');
  assert.deepEqual(gallery.items, [], 'A gallery read must not seed an incomplete first-run or identity-only restore destination.');
}

/** Extend secondaryCreateDestinations after its existing Page from template navigation. */
export async function starterTemplatesJourney(state) {
  const { page, origin, api, context } = state;
  const initial = await api('/api/templates?category=');
  const shipped = initial.items.filter(item => item.isShipped);
  const starters = requiredStarters.map(title => {
    const matches = shipped.filter(item => item.title.toLocaleLowerCase() === title.toLocaleLowerCase());
    assert.equal(matches.length, 1, `The named starter ${title} is available once after first run.`);
    assert.ok(matches[0].category, `${title} has a gallery category.`);
    return matches[0];
  });
  const detail = new Map();
  if (new URL(page.url()).pathname !== '/app/templates')
    await page.goto(`${origin}/app/templates`, { waitUntil: 'networkidle' });

  async function select(item) {
    await page.getByLabel('Category', { exact: true }).fill(item.category);
    await page.getByRole('searchbox', { name: 'Find a template', exact: true }).fill(item.title);
    const choice = page.locator('.template-choice').filter({ has: page.getByRole('heading', { name: item.title, exact: true }) });
    await expect(choice).toBeVisible();
    await choice.click();
    const preview = page.getByRole('region', { name: `Page preview: ${item.snapshot?.title ?? item.title}`, exact: true });
    await expect(preview).toBeVisible();
    return preview;
  }

  for (const starter of starters) {
    const preview = await select(starter);
    const current = await api(`/api/templates/${starter.id}`);
    detail.set(starter.title, current);
    assert.equal(current.isShipped, true);
    assert.equal(current.permissions.canManage, false);
    assert.equal(current.category, starter.category);
    assert.ok(current.snapshot.blocks.length, `${starter.title} previews its authored page structure.`);
    await expect(preview.getByRole('heading', { name: current.snapshot.title, exact: true })).toBeVisible();
    for (const block of current.snapshot.blocks.filter(block => block.blockType === 'task')) {
      assert.equal(block.content.done, false, 'A starter does not claim work is complete.');
      assert.equal(block.content.assigneeMemberId ?? null, null, 'No example person is assigned.');
    }
    await expect(page.locator('.template-preview').getByRole('button', { name: 'Update from a page', exact: true })).toBeDisabled();
    await expect(page.locator('.template-preview').getByRole('button', { name: 'Archive', exact: true })).toBeDisabled();
  }

  // Clearing Category must expose the gallery again, including every required starter.
  await page.getByLabel('Category', { exact: true }).fill('');
  await page.getByRole('searchbox', { name: 'Find a template', exact: true }).fill('');
  for (const starter of starters)
    await expect(page.locator('.template-choice').getByRole('heading', { name: starter.title, exact: true })).toBeVisible();

  async function use(item, reviewDate) {
    await page.goto(`${origin}/app/templates`, { waitUntil: 'networkidle' });
    await select(item);
    const current = await api(`/api/templates/${item.id}`);
    await page.locator('.template-preview').getByRole('button', { name: 'Use this template', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Use this template', exact: true });
    const destination = current.applyDestinations.findIndex(item => item.parentPageId === null);
    assert.ok(destination >= 0, 'A completed workspace offers an authorized real destination.');
    await dialog.getByRole('combobox', { name: 'Create in', exact: true }).selectOption(String(destination));
    if (reviewDate) await dialog.getByLabel('Review date', { exact: true }).fill(reviewDate);
    const applied = page.waitForResponse(response => new URL(response.url()).pathname === `/api/templates/${item.id}/apply` && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Create page', exact: true }).click();
    const response = await applied;
    assert.equal(response.status(), 201, await response.text());
    const result = await response.json();
    await expect(page).toHaveURL(`${origin}/app/pages/${result.value.pageId}`);
    return { id: result.value.pageId, document: await api(`/api/pages/${result.value.pageId}`) };
  }

  const meeting = starters.find(item => item.title === 'Meeting notes');
  const created = await use(meeting);
  const authored = detail.get(meeting.title).snapshot;
  assert.deepEqual(created.document.blocks.map(block => block.blockType), authored.blocks.map(block => block.blockType));
  assert.deepEqual(created.document.blocks.filter(block => block.blockType !== 'task').map(block => block.content), authored.blocks.filter(block => block.blockType !== 'task').map(block => block.content));
  const task = created.document.blocks.find(block => block.blockType === 'task');
  assert.ok(task, 'The applied meeting contains a native task block.');
  const taskRow = page.locator(`[data-block-id="${task.id}"]`);
  const taskText = `Follow up on the meeting ${randomUUID().slice(0, 8)}`;
  const textSaved = page.waitForResponse(response => new URL(response.url()).pathname === `/api/pages/${created.id}/blocks/${task.id}` && response.request().method() === 'PATCH');
  await taskRow.getByRole('textbox', { name: 'To-do item', exact: true }).fill(taskText);
  await taskRow.getByRole('combobox', { name: 'Task assignee', exact: true }).focus();
  assert.equal((await textSaved).status(), 200);
  const people = await api(`/api/tasks/${created.id}/assignees`);
  const assignee = people.items.find(person => person.id === 'browser-reader');
  assert.ok(assignee, 'Assignment uses the real second member from this workspace.');
  const assigned = page.waitForResponse(response => new URL(response.url()).pathname === `/api/pages/${created.id}/blocks/${task.id}` && response.request().method() === 'PATCH' && response.request().postDataJSON()?.content?.assigneeMemberId === assignee.id);
  await taskRow.getByRole('combobox', { name: 'Task assignee', exact: true }).selectOption(assignee.id);
  if (!assignee.canRead)
    await page.getByRole('dialog', { name: 'Share before assigning', exact: true }).getByRole('button', { name: 'Share page and assign', exact: true }).click();
  assert.equal((await assigned).status(), 200);
  const assignedTask = (await api(`/api/pages/${created.id}`)).blocks.find(block => block.id === task.id);
  assert.equal(assignedTask.content.assigneeMemberId, assignee.id);
  assert.equal(assignedTask.content.done, false);
  assert.equal(assignedTask.content.text.map(span => span.text).join(''), taskText);
  const readerPage = await context.request.get(`${origin}/api/pages/${created.id}`, { headers: { cookie: state.readerCookie } });
  assert.equal(readerPage.status(), 200, 'The assigned person can actually open the task page.');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator(`[data-block-id="${task.id}"]`).getByRole('combobox', { name: 'Task assignee', exact: true })).toHaveValue(assignee.id);

  const retro = starters.find(item => item.title === 'Retrospective');
  const original = detail.get(retro.title);
  await page.goto(`${origin}/app/templates`, { waitUntil: 'networkidle' });
  await select(retro);
  await page.locator('.template-preview').getByRole('button', { name: 'Duplicate', exact: true }).click();
  const duplicate = page.getByRole('dialog', { name: 'Duplicate template', exact: true });
  const duplicated = page.waitForResponse(response => new URL(response.url()).pathname === `/api/templates/${retro.id}/change` && response.request().method() === 'POST');
  await duplicate.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const copyResponse = await duplicated;
  assert.equal(copyResponse.status(), 200, await copyResponse.text());
  const copyId = (await copyResponse.json()).value.id;
  await expect(duplicate).not.toBeVisible();
  const copy = await api(`/api/templates/${copyId}`);
  assert.equal(copy.isShipped, false);
  assert.equal(copy.permissions.canManage, true);
  assert.deepEqual(copy.snapshot, original.snapshot, 'Duplicating retains the retrospective page before customization.');
  await page.goto(`${origin}/app/templates/${copyId}`, { waitUntil: 'networkidle' });
  await page.locator('.template-preview').getByRole('button', { name: 'Update from a page', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Update this template', exact: true });
  const customTitle = `Our retrospective ${randomUUID().slice(0, 8)}`;
  await edit.getByRole('combobox', { name: 'Source page', exact: true }).selectOption(created.id);
  await edit.getByRole('textbox', { name: 'Name', exact: true }).fill(customTitle);
  const updated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/templates' && response.request().method() === 'POST');
  await edit.getByRole('button', { name: 'Save updated template', exact: true }).click();
  assert.equal((await updated).status(), 201);
  await expect(edit).not.toBeVisible();
  assert.equal((await api(`/api/templates/${copyId}`)).title, customTitle);

  const protectedInput = { operationKey: randomUUID(), expectedRevisionId: original.revisionId };
  for (const action of ['archive', 'delete']) {
    const refusal = await call(context, origin, 'POST', `/api/templates/${retro.id}/change`, { ...protectedInput, operationKey: randomUUID(), action });
    assert.equal(refusal.status, 403);
    assert.equal(refusal.body.code, 'SHIPPED_TEMPLATE');
  }
  const editRefusal = await call(context, origin, 'POST', '/api/templates', {
    ...protectedInput, id: retro.id, sourcePageId: created.id, includeChildren: false,
    containerId: null, title: customTitle, description: '', category: retro.category,
  });
  assert.equal(editRefusal.status, 403);
  assert.equal(editRefusal.body.code, 'SHIPPED_TEMPLATE');
  const unchanged = await api(`/api/templates/${retro.id}`);
  assert.equal(unchanged.revisionId, original.revisionId);
  assert.deepEqual(unchanged.snapshot, original.snapshot);
  assert.equal(unchanged.title, original.title);

  const policy = starters.find(item => item.title === 'Policy page');
  const reviewDate = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const policyPage = await use(policy, reviewDate);
  const session = await api('/api/session');
  assert.equal(policyPage.document.properties.ownerMemberId, session.member.id);
  assert.equal(policyPage.document.properties.reviewDate, reviewDate);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await api(`/api/pages/${policyPage.id}`)).properties.reviewDate, reviewDate);
  const reloaded = await api('/api/templates?category=');
  for (const starter of starters)
    assert.deepEqual(reloaded.items.filter(item => item.isShipped && item.title === starter.title).map(item => item.id), [starter.id], 'Gallery reload neither duplicates nor removes a shipped starter.');
}
