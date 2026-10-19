import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible } from './browser-evidence.mjs';
import { grant, ok, restrictedPage } from './two-people-support.mjs';

/**
 * BLOCK-016: Alex embeds a report filtered to one space and one assignee over tasks on
 * three restricted pages. Morgan, who can read two of them, sees two tasks and nothing of
 * the third, completes one from the report, and the page shows it done. The published
 * page shows the report as a sign-in notice and never runs it for an anonymous reader.
 */
export async function taskReportJourney(state, people) {
  const { origin } = state, { alice, bob } = people;
  const width = alice.page.viewportSize().width;
  const shot = (view, label) => view.screenshot({ path: path.join(root, `.artifacts/ui-convergence/task-report-${width}-${label}.png`), fullPage: true });
  const titles = ['Alpha rollout page', 'Beta rollout page', 'Confidential rollout page'];
  const texts = ['Draft the rollout notes', 'Book the review room', 'Brief the acquisition board'];
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const sources = [];
  for (const [index, title] of titles.entries()) {
    const source = await restrictedPage({ context: alice.context, origin }, title, []);
    if (index < 2) await grant(alice.context, origin, source.pageId, bob.id, index === 0 ? 'edit' : 'view');
    const document = await ok(alice.context, origin, 'GET', `/api/pages/${source.pageId}`);
    const blockId = randomUUID();
    await ok(alice.context, origin, 'PUT', `/api/pages/${source.pageId}/blocks`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, blocks: [
      { id: blockId, blockType: 'task', treePosition: '1', content: { text: [{ text: texts[index] }], done: false, assigneeMemberId: 'browser-owner', dueDate: day(index + 2) } },
    ] });
    sources.push({ ...source, blockId });
  }
  const spaceId = sources[0].spaceId;
  const { value: { pageId } } = await ok(alice.context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: spaceId, title: 'Rollout task report' });
  await grant(alice.context, origin, pageId, bob.id, 'view');

  // Alex inserts the report from the insert menu and filters it to the space and to himself.
  await alice.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await alice.page.getByRole('button', { name: /Add block/ }).click();
  await alice.page.getByPlaceholder('Type to search').fill('Task report');
  await alice.page.getByRole('option', { name: 'Task report', exact: true }).click();
  const report = alice.page.getByRole('region', { name: 'Task report', exact: true });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: 'Edit report', exact: true }).click();
  const dialog = alice.page.getByRole('dialog', { name: 'Edit task report' });
  await dialog.getByRole('combobox', { name: 'Report space', exact: true }).selectOption(spaceId);
  await dialog.getByRole('combobox', { name: 'Report assignee', exact: true }).selectOption('member:browser-owner');
  await dialog.getByRole('button', { name: 'Save report', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = async () => (await ok(alice.context, origin, 'GET', `/api/pages/${pageId}`)).blocks.find(block => block.blockType === 'task-report')?.content.definition ?? {};
  await expect.poll(saved).toMatchObject({ containerId: spaceId, assignee: { kind: 'member', memberId: 'browser-owner' } });
  await alice.page.reload({ waitUntil: 'networkidle' });
  for (const text of texts) await expect(report.getByRole('link', { name: text, exact: true })).toBeVisible();
  for (const title of titles) await expect(report.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(report.getByText(/^Last ran /)).toBeVisible();
  await accessible(alice.page, 'task report for a reader of every page');
  await shot(alice.page, 'all-three');

  // Morgan reads two of the three pages: two tasks, and no count, title or placeholder for the third.
  await bob.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const bobReport = bob.page.getByRole('region', { name: 'Task report', exact: true });
  for (const text of texts.slice(0, 2)) await expect(bobReport.getByRole('link', { name: text, exact: true })).toBeVisible();
  await expect(bobReport.locator('.task-list > li')).toHaveCount(2);
  await expect(bobReport.locator('h3')).toHaveCount(2);
  await expect(bob.page.locator('body')).not.toContainText(texts[2]);
  await expect(bob.page.locator('body')).not.toContainText(titles[2]);
  await expect(bobReport.getByRole('checkbox', { name: `Complete: ${texts[1]}`, exact: true })).toBeDisabled();
  await accessible(bob.page, 'task report for a reader of two pages');
  await shot(bob.page, 'two-of-three');

  // Morgan edits the first page, so completes its task from the report; the page shows it done.
  const [completing] = await Promise.all([bob.page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes(`/api/tasks/${sources[0].pageId}/${sources[0].blockId}`)), bobReport.getByRole('checkbox', { name: `Complete: ${texts[0]}`, exact: true }).click()]);
  assert.equal(completing.status(), 200, 'Completing from the report commits on the source page.');
  await expect(bobReport.getByRole('checkbox', { name: `Complete: ${texts[0]}`, exact: true })).toBeChecked();
  const source = await ok(alice.context, origin, 'GET', `/api/pages/${sources[0].pageId}`);
  assert.deepEqual([source.blocks[0].content.done, source.blocks[0].content.completedByMemberId], [true, bob.id]);
  await bobReport.getByRole('link', { name: titles[0], exact: true }).click();
  await bob.page.waitForURL(`**/app/pages/${sources[0].pageId}`);
  await expect(bob.page.getByRole('checkbox', { name: `Mark complete: ${texts[0]}`, exact: true })).toBeChecked();
  await shot(bob.page, 'completed-on-page');

  // Published, the report is a sign-in notice; the anonymous reader never runs it.
  const document = await ok(alice.context, origin, 'GET', `/api/pages/${pageId}`);
  await ok(alice.context, origin, 'POST', `/api/publishing/${pageId}`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, host: new URL(origin).host, slug: 'rollout-task-report' });
  const publicContext = await alice.context.browser().newContext({ viewport: alice.page.viewportSize() });
  const requests = [];
  publicContext.on('request', request => requests.push(new URL(request.url()).pathname));
  try {
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`${origin}/p/rollout-task-report`, { waitUntil: 'networkidle' });
    assert.deepEqual(await publicContext.cookies(), [], 'The public reader has no session.');
    await expect(publicPage.getByText('Sign in to view this task report.', { exact: true })).toBeVisible();
    for (const hidden of [...texts, ...titles]) await expect(publicPage.locator('body')).not.toContainText(hidden);
    assert.deepEqual(requests.filter(route => route.startsWith('/api/')), [], 'An anonymous reader never runs the report.');
    await shot(publicPage, 'published');
  } finally { await publicContext.close(); }
}
