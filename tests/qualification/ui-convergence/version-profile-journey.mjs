import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {root} from '../../e2e/runtime-harness.mjs';
import {accessible} from './browser-evidence.mjs';
import {call, editable, ok, restrictedPage, savedAfterCommit} from './two-people-support.mjs';

async function profile(state, lifecycle, version) {
  const {page, origin} = state;
  await page.goto(`${origin}/app/settings`, {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: 'Edit workspace & policies', exact: true}).click();
  await page.locator('select[name="page.lifecycle.v1"]').selectOption(lifecycle);
  await page.locator('select[name="page.version.v1"]').selectOption(version);
  await page.getByRole('button', {name: 'Save settings', exact: true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function publicationDialog(page) {
  await page.getByRole('button', {name: 'More', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Publish workspace revision', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Publish this revision', exact: true});
  await expect(dialog.getByRole('region', {name: 'Workspace publication preview'})).toBeVisible();
  return dialog;
}

/** The complete native save, publication and history flow, in an existing desktop registration. */
export async function versionProfileJourney(state, people) {
  const {origin, page, context} = state;
  const workspace = await ok(context, origin, 'GET', '/api/workspace');
  const {pageId, blockIds: [blockId]} = await restrictedPage({context, origin}, 'Version profile guide', ['Original response']);
  const read = () => ok(context, origin, 'GET', `/api/pages/${pageId}`);
  const history = async () => (await ok(context, origin, 'GET', `/api/revisions/${pageId}`)).items;
  const select = async id => {
    await page.goto(`${origin}/app/pages/${pageId}?detail=history`, {waitUntil: 'networkidle'});
    await page.locator(`[data-revision-id="${id}"] button`).click();
    await expect(page.locator('.revision-preview')).toBeVisible();
  };
  const save = async text => {
    await page.goto(`${origin}/app/pages/${pageId}`, {waitUntil: 'networkidle'});
    return savedAfterCommit(page, blockId, () => editable(page, blockId).fill(text));
  };
  const compare = async (left, right, before, after) => {
    await select(left);
    await page.getByLabel('Compare with', {exact: true}).selectOption(right);
    const comparison = page.getByRole('region', {name: 'Revision comparison'});
    await expect(comparison.getByRole('heading', {name: 'changed', exact: true})).toBeVisible();
    await expect(comparison).toContainText(before);
    await expect(comparison).toContainText(after);
  };
  try {
    for (const [key, label] of [['version-progress', 'In progress'], ['version-review', 'Ready for review']]) {
      await ok(context, origin, 'POST', '/api/status', {operationKey: randomUUID(), key, label, color: '#4488cc', requiresVerification: false});
    }
    await profile(state, 'always-live', 'autosnapshot');
    const original = (await read()).workingRevisionId;
    const saved = await save('Saved response');
    const automatic = await history();
    assert.ok(automatic.length >= 2);
    assert.equal(automatic[0].id, saved.revisionId);
    assert.ok(automatic.every(item => item.ordinal === null && item.label === null));
    await compare(original, saved.revisionId, 'Original response', 'Saved response');
    await expect(page.locator('.history-list')).not.toContainText(/Version comment:|Version \d|Status at save:/);
    await expect(page.getByLabel('Compare with', {exact: true})).not.toContainText('Version comment');
    await expect(page.getByRole('button', {name: 'Delete this intermediate revision', exact: true})).toHaveCount(0);
    const refused = await call(context, origin, 'DELETE', `/api/revisions/${pageId}/${original}`, {operationKey: randomUUID()});
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'POLICY_RESTRICTED');
    assert.deepEqual(await history(), automatic, 'A hidden deletion cannot be performed through the API.');
    await people.shot('alice', 'autosnapshot selection comparison and summaries');
    await page.getByRole('button', {name: 'Restore this revision', exact: true}).click();
    await page.getByRole('dialog', {name: 'Restore this revision?'}).getByRole('button', {name: 'Restore revision', exact: true}).click();
    await expect.poll(async () => (await read()).blocks[0].content.text[0].text).toBe('Original response');
    const restored = (await read()).workingRevisionId;
    assert.ok(!automatic.some(item => item.id === restored));
    assert.equal((await history()).length, automatic.length + 1);

    // Always-live is not a publication event, even with labelled versions enabled.
    await profile(state, 'always-live', 'labelled');
    const ordinary = await save('Ordinary live save');
    assert.ok((await history()).every(item => item.ordinal === null && item.label === null));
    await profile(state, 'draft-then-publish', 'labelled');
    const publish = async (comment, statusKey) => {
      const current = await read();
      await ok(context, origin, 'POST', `/api/status/page/${pageId}`, {operationKey: randomUUID(), expectedRevisionId: current.page.revisionId, statusKey});
      await page.goto(`${origin}/app/pages/${pageId}`, {waitUntil: 'networkidle'});
      const dialog = await publicationDialog(page);
      await dialog.getByLabel('Version label', {exact: true}).fill(comment);
      await people.shot('alice', 'labelled publication comment field');
      await dialog.getByRole('button', {name: 'Review publication', exact: true}).click();
      await expect(dialog.getByRole('region', {name: 'Reviewed publication'})).toBeVisible();
      const receipt = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/pages/${pageId}/publish`);
      await dialog.getByRole('button', {name: 'Publish workspace revision', exact: true}).click();
      const response = await receipt;
      assert.equal(response.status(), 200);
      const result = await response.json();
      await expect(dialog).toBeHidden();
      assert.equal((await read()).publishedRevisionId, result.value.revisionId);
      return result.value.revisionId;
    };
    const first = await publish('Response approved', 'version-progress');
    await save('Second published response');
    const second = await publish('Response revised', 'version-review');
    const numbered = await history();
    assert.deepEqual(numbered.filter(item => item.origin === 'publish').map(item => [item.id, item.ordinal, item.label, item.statusKey]), [
      [second, 2, 'Response revised', 'version-review'], [first, 1, 'Response approved', 'version-progress'],
    ]);
    assert.equal(numbered.find(item => item.id === ordinary.revisionId).ordinal, null);
    await compare(first, second, 'Ordinary live save', 'Second published response');
    for (const [id, ordinal, comment, status] of [[first, 1, 'Response approved', 'In progress'], [second, 2, 'Response revised', 'Ready for review']]) {
      const row = page.locator(`[data-revision-id="${id}"]`);
      await expect(row).toContainText(`Version ${ordinal}`);
      await expect(row).toContainText(`Version comment: ${comment}`);
      await expect(row).toContainText(`Status at save: ${status}`);
      await expect(row).toContainText('Origin: publish');
      await expect(row).toContainText(people.alice.name);
      assert.equal(await row.locator('time').getAttribute('datetime'), numbered.find(item => item.id === id).createdAt);
    }
    await expect(page.getByRole('button', {name: 'Delete this intermediate revision', exact: true})).toBeVisible();
    await people.shot('alice', 'labelled history retains comments status and deletion');
    await accessible(page, 'labelled version history');

    // Switching hides presentation only; the numbered immutable snapshots remain.
    await profile(state, 'draft-then-publish', 'autosnapshot');
    await compare(first, second, 'Ordinary live save', 'Second published response');
    await expect(page.locator('.history-list')).not.toContainText(/Response approved|Response revised|Version \d|Version comment:|Status at save:/);
    await expect(page.getByLabel('Compare with', {exact: true})).not.toContainText('Response revised');
    await expect(page.getByRole('button', {name: 'Delete this intermediate revision', exact: true})).toHaveCount(0);
    await people.shot('alice', 'autosnapshot preserves numbered snapshots without showing labels');
    await page.goto(`${origin}/app/pages/${pageId}`, {waitUntil: 'networkidle'});
    const dialog = await publicationDialog(page);
    await expect(dialog.getByLabel('Version label', {exact: true})).toHaveCount(0);
    await people.shot('alice', 'autosnapshot publication hides comment field');
    await page.keyboard.press('Escape');
    assert.deepEqual(await history(), numbered);
    await profile(state, 'draft-then-publish', 'labelled');
    assert.deepEqual(await history(), numbered);
    people.record('versionProfile', {pageId, original, saved: saved.revisionId, restored, ordinary: ordinary.revisionId, publications: [first, second]});
  } finally {
    await profile(state, workspace.policies['page.lifecycle.v1'] ?? 'always-live', workspace.policies['page.version.v1'] ?? 'autosnapshot');
  }
}

/** Phone proof of the changed surfaces; functional assertions stay in the desktop journey. */
export async function versionProfileScreens(state) {
  const {context, origin, page} = state;
  const workspace = await ok(context, origin, 'GET', '/api/workspace');
  const {pageId} = await restrictedPage({context, origin}, 'Phone version history', ['Saved response']);
  const directory = `${root}/.artifacts/ui-convergence/`;
  try {
    await profile(state, 'draft-then-publish', 'labelled');
    const publish = async label => {
      const current = await ok(context, origin, 'GET', `/api/pages/${pageId}`);
      return (await ok(context, origin, 'POST', `/api/pages/${pageId}/publish`, {operationKey: randomUUID(), expectedRevisionId: current.page.revisionId, label})).value.revisionId;
    };
    const first = await publish('Response approved');
    await publish('Response revised');
    for (const version of ['labelled', 'autosnapshot']) {
      await profile(state, 'draft-then-publish', version);
      await page.goto(`${origin}/app/pages/${pageId}?detail=history&revision=${first}`, {waitUntil: 'networkidle'});
      await page.locator('.revision-preview').waitFor();
      await page.screenshot({path: `${directory}version-${version}-390-history.png`, fullPage: true});
      await page.goto(`${origin}/app/pages/${pageId}`, {waitUntil: 'networkidle'});
      await publicationDialog(page);
      await page.screenshot({path: `${directory}version-${version}-390-publish.png`, fullPage: true});
      await page.keyboard.press('Escape');
    }
  } finally {
    await profile(state, workspace.policies['page.lifecycle.v1'] ?? 'always-live', workspace.policies['page.version.v1'] ?? 'autosnapshot');
  }
}
