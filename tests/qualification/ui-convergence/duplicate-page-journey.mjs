import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { duplicationFixture, duplicationSnapshot, assertDuplication } from '../../helpers/page-duplication.mjs';
import { accessible, openPageAction } from './browser-support.mjs';
import { call, ok } from './two-people-support.mjs';

/** Duplicate the fully populated tree through the native More menu and destination picker. */
export async function duplicatePageJourney(state, people) {
  const { page, context, origin } = state, width = page.viewportSize().width;
  await state.switchIdentity('owner');
  const fixture = await duplicationFixture(async (method, route, data, who) => {
    const result = await call(who === 'reader' ? people.bob.context : context, origin, method, route, data);
    return { status: result.status, data: result.body };
  }, { ownerId: 'browser-owner', readerId: 'browser-reader', host: new URL(origin).host });
  const evidence = `.artifacts/ui-convergence/duplicate-${width}`;
  await mkdir(evidence, { recursive: true });
  for (const includeChildren of [false, true]) {
    await page.goto(`${origin}/app/pages/${fixture.root}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Duplication handbook');
    const before = await duplicationSnapshot(fixture);
    const pagesBefore = (await fixture.call('GET', '/api/pages')).items;
    await openPageAction(page, 'Duplicate page');
    const dialog = page.getByRole('dialog', { name: 'Duplicate page', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox', { name: 'Find a space', exact: true }).fill('Duplication destination');
    await dialog.getByRole('combobox', { name: 'Destination space', exact: true }).selectOption(fixture.destinationSpace);
    await dialog.getByRole('searchbox', { name: 'Find a parent page', exact: true }).fill('Copies belong here');
    await dialog.getByRole('combobox', { name: 'Parent page', exact: true }).selectOption(fixture.destinationParent);
    await dialog.getByRole('checkbox', { name: 'Include child pages', exact: true }).setChecked(includeChildren);
    await accessible(page, `duplicate ${includeChildren ? 'tree' : 'page'} destination`);
    let receipt;
    let complete, fail;
    const committed = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    const matches = url => url.pathname === `/api/pages/${fixture.root}/duplicate`;
    const intercept = async route => {
      try {
        const response = await route.fetch({ maxRetries: 0 });
        assert.equal(response.status(), 200, await response.text());
        receipt = await response.json();
        const submitted = route.request().postDataJSON();
        assert.equal(submitted.containerId, fixture.destinationSpace);
        assert.equal(submitted.parentPageId, fixture.destinationParent);
        assert.equal(submitted.includeChildren, includeChildren);
        const proof = await assertDuplication(fixture, before, receipt.value.pageId, includeChildren);
        const pagesAfter = (await fixture.call('GET', '/api/pages')).items;
        const created = pagesAfter.filter(item => !pagesBefore.some(prior => prior.id === item.id));
        assert.equal(created.length, includeChildren ? fixture.sourceIds.length : 1);
        assert.deepEqual(new Set(created.map(item => item.id)), new Set(proof.copy.pages.map(row => row.document.page.id)));
        assert.equal(receipt.receipt.entity.id, receipt.value.pageId);
        assert.equal(receipt.receipt.revisionId, receipt.value.revisionId);
        await writeFile(`${evidence}/${includeChildren ? 'tree' : 'page'}.json`, JSON.stringify({ submitted, receipt, ...proof }, null, 2));
        await route.fulfill({ response });
        complete();
      } catch (cause) { await route.abort().catch(() => {}); fail(cause); }
    };
    await page.route(matches, intercept);
    try {
      await dialog.getByRole('button', { name: 'Create copy', exact: true }).click();
      await committed;
    } finally { await page.unroute(matches, intercept); }
    const copyId = receipt.value.pageId;
    await expect(page).toHaveURL(`${origin}/app/pages/${copyId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Duplication handbook');
    await expect(page.locator('[data-page-editor]')).toContainText('Nested retained text');
    // The first actual display earns the copy's own view; none came from its source.
    const views = await fixture.call('GET', `/api/analytics?pageId=${copyId}`);
    assert.equal(views.totalViews, 1);
    assert.equal(views.ownPageViews, 1);
    assert.equal(views.uniqueViewers, 1);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Duplication handbook');
    await expect(page.locator('[data-page-editor]')).toContainText('Nested retained text');
    const durable = await fixture.call('GET', `/api/pages/${copyId}`);
    assert.deepEqual(durable.properties, before.pages[0].document.properties);
    const reloaded = await duplicationSnapshot(fixture, [copyId]);
    assert.equal(reloaded.pages[0].history.items.length, 1);
    assert.equal(reloaded.pages[0].analytics.totalViews, 2);
    assert.equal(reloaded.pages[0].exposure.exposure, null);
    assert.deepEqual(reloaded.pages[0].comments.threads, []);
    await accessible(page, `duplicate ${includeChildren ? 'tree' : 'page'} reloaded`);
    await writeFile(`${evidence}/${includeChildren ? 'tree' : 'page'}-reload.json`, JSON.stringify(reloaded, null, 2));
  }
  // Removing the destination's authority must take effect on every copied page.
  const grant = (await fixture.call('GET', `/api/sharing/pages/${fixture.destinationParent}`)).items.find(item => item.principalId === 'browser-reader');
  await ok(context, origin, 'POST', '/api/sharing', { operationKey: crypto.randomUUID(), targetKind: 'page', targetId: fixture.destinationParent, id: grant.id, principalKind: 'member', principalId: 'browser-reader', level: 'comment', revoke: true });
  const copies = (await fixture.call('GET', '/api/pages')).items.filter(item => item.containerId === fixture.destinationSpace && item.id !== fixture.destinationParent);
  for (const copy of copies) {
    const result = await fixture.call('GET', `/api/pages/${copy.id}`, undefined, 'reader');
    assert.equal(result.permissions.level, 'view', 'The remaining destination container grant is effective immediately.');
  }
}
