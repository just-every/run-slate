import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { expect } from '@playwright/test';
import { openPageAction, closeDetails } from './browser-support.mjs';
import { grant, ok, restrictedPage } from './two-people-support.mjs';

export async function analyticsJourney(state, people) {
  const { page, origin, context, api } = state;
  const width = page.viewportSize().width;
  const { pageId, spaceId } = await restrictedPage(state, 'Incident response guide', ['Name an incident owner, record the impact and agree on the next customer update.']);
  await grant(context, origin, pageId, 'browser-reader', 'view');
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await people.bob.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const before = await api(`/api/analytics?pageId=${pageId}`);
  assert.equal(before.totalViews, 2); assert.equal(before.uniqueViewers, 2); assert.equal(before.ownPageViews, 1);
  await openPageAction(people.bob.page, 'Readership & contributors');
  const panel = people.bob.page.getByRole('region', { name: 'Page readership', exact: true });
  await expect(panel).toContainText('2 views');
  await expect(panel).toContainText('Author views: 1 (included).');
  await expect(panel.getByRole('list')).toContainText('Alex Owner');
  await expect(panel.getByRole('list')).toContainText('Morgan Reader');
  await expect(panel).toContainText('Contributors');
  assert.deepEqual(await api(`/api/analytics?pageId=${pageId}`), before, 'Opening a page panel does not add another visit.');
  await people.bob.page.screenshot({ path: `.artifacts/ui-convergence/analytics-${width}-page.png`, fullPage: false });
  const day = new Date().toISOString().slice(0, 10);
  await panel.getByLabel('From', { exact: true }).fill(day);
  await panel.getByLabel('Until', { exact: true }).fill(day);
  await panel.getByRole('button', { name: 'Apply dates' }).click();
  await expect(panel.getByRole('table', { name: 'Readership over time' })).toContainText(day);
  await expect(panel).toContainText('2 views');
  await panel.getByLabel('Include views by page authors').uncheck();
  await expect(panel).toContainText('1 views');
  await expect(panel).toContainText('Author views: 1 (excluded).');
  await panel.getByRole('combobox', { name: 'Measure' }).selectOption('uniqueViewers');
  await expect(panel).toContainText('2 unique signed-in viewers');
  await people.bob.page.screenshot({ path: `.artifacts/ui-convergence/analytics-${width}-filtered.png`, fullPage: false });
  await closeDetails(people.bob.page);
  await people.bob.page.waitForLoadState('networkidle');
  assert.deepEqual(await api(`/api/analytics?pageId=${pageId}`), before, 'Closing a page panel does not add a visit.');
  await people.bob.page.reload({ waitUntil: 'networkidle' });
  assert.equal((await api(`/api/analytics?pageId=${pageId}`)).totalViews, 3, 'Reopening the document counts a genuine visit.');
  await page.goto(`${origin}/app/containers/${spaceId}`, { waitUntil: 'networkidle' });
  await page.locator('summary').filter({ hasText: /^Readership$/ }).click();
  const space = page.getByRole('region', { name: 'Space readership', exact: true });
  await expect(space).toContainText('Morgan Reader');
  await expect(space.getByRole('table', { name: 'Readership over time' })).toContainText(day);
  const metrics = await api(`/api/analytics?containerId=${spaceId}`);
  assert.ok(metrics.totalViews >= 3); assert.equal(metrics.uniqueViewers, 2);
  await space.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.artifacts/ui-convergence/analytics-${width}-space.png`, fullPage: false });

  // Real pages plus historical clock fixtures make every report legible in the browser.
  const {value:{pageId:legacyId}}=await ok(context,origin,'POST','/api/pages',{operationKey:crypto.randomUUID(),containerId:spaceId,title:'Legacy escalation checklist',properties:{ownerMemberId:null}});
  await state.atRest(`UPDATE pages SET created_at='2000-01-02T12:00:00.000Z',updated_at='2000-01-02T12:00:00.000Z' WHERE id='${legacyId}';
    UPDATE page_revisions SET created_at='2000-01-02T12:00:00.000Z' WHERE page_id='${legacyId}';
    UPDATE pages SET status_key='verified' WHERE id='${pageId}';
    INSERT INTO page_verifications(id,page_id,revision_id,status_key,owner_member_id,verified_by_member_id,expires_at,created_at)
      SELECT '${crypto.randomUUID()}',id,working_revision_id,'verified','browser-owner','browser-owner','2000-01-02T12:00:00.000Z','2000-01-01T12:00:00.000Z' FROM pages WHERE id='${pageId}';`);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('summary').filter({hasText:/^Readership$/}).click();
  // ADMIN-004: the existing space panel is the entry point for owner reports.
  const reports = space.getByRole('region', { name: 'Owner analytics reports', exact: true });
  await expect(reports.getByRole('combobox', { name: 'Report', exact: true })).toBeVisible();
  await expect(reports.getByRole('table', { name: 'Views and unique viewers', exact: true })).toContainText('Incident response guide');
  await api(`/api/search?${new URLSearchParams({ q: `absent-analytics-${width}`, containerId: spaceId })}`);
  const kinds = ['views', 'stale', 'unowned', 'lapsed-verifications', 'most-viewed-unverified', 'no-results', 'container-growth'];
  for (const kind of kinds) {
    if (kind !== 'views') {
      const loaded = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/analytics/reports' && url.searchParams.get('report') === kind && response.status() === 200;
      });
      await reports.getByRole('combobox', { name: 'Report', exact: true }).selectOption(kind);
      await loaded;
    }
    const link = reports.getByRole('link', { name: 'Export report as CSV' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', new RegExp(`report=${kind}`));
    await reports.scrollIntoViewIfNeeded();
    await page.screenshot({path:`.artifacts/ui-convergence/analytics-${width}-report-${kind}.png`,fullPage:false});
    const downloadReady = page.waitForEvent('download');
    await link.click();
    const download = await downloadReady;
    assert.equal(await download.failure(), null, `${kind} CSV downloaded`);
    assert.ok(download.suggestedFilename().endsWith('.csv'));
    assert.ok((await readFile(await download.path(),'utf8')).trim().length>0,'The downloaded report contains CSV data.');
    if (kind === 'no-results') await expect(reports.getByRole('table')).toContainText(`absent-analytics-${width}`);
  }
  await reports.getByRole('combobox', { name: 'Report', exact: true }).selectOption('no-results');
  await expect(reports.getByRole('table')).toContainText(`absent-analytics-${width}`);
  await reports.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.artifacts/ui-convergence/analytics-${width}-owner-reports.png`, fullPage: false });
  await reports.getByRole('combobox', { name: 'Report scope' }).selectOption('');
  await expect(reports.getByRole('combobox', { name: 'Report scope' })).toHaveValue('');
  await expect(reports.getByRole('table')).toContainText(`absent-analytics-${width}`);
  assert.ok(await reports.evaluate(node => node.clientWidth <= document.documentElement.clientWidth), 'Reports fit the desktop and mobile viewport.');
}
