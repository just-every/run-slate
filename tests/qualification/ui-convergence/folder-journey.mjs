import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { folderFixture } from '../../helpers/folder-edge.mjs';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible } from './browser-evidence.mjs';
import { openNavigation } from './browser-support.mjs';

const base = '/api/imports/provider-folders';
/** Two delegated provider accounts, real folder preview, real parsers and private publication. */
export async function folderJourney(state) {
  const { page, context, origin, api, readFolderRequests, assertNoConsoleErrors } = state;
  const width = page.viewportSize().width;
  const evidence = process.env.SLATE_FOLDER_EVIDENCE_DIR ?? path.join(root, 'evidence/provider-folders');
  await mkdir(evidence, { recursive: true });
  const panel = page.getByRole('region', { name: 'Folder imports', exact: true });
  const review = page.getByRole('region', { name: 'Folder import review', exact: true });
  const report = page.getByRole('region', { name: 'Retained folder import report', exact: true });
  const destination = (await api('/api/pages')).items.find(item => item.title === 'Welcome');
  assert.ok(destination, 'The real first-run page is the import destination');
  const open = () => page.goto(`${origin}/app/settings?section=portability`, { waitUntil: 'networkidle' });
  const shot = async (provider, label, focus) => {
    await focus.scrollIntoViewIfNeeded();
    await accessible(page, `folder import ${provider} ${label}`);
    assertNoConsoleErrors();
    await page.screenshot({ path: path.join(evidence, `folders-${width}-${provider}-${label}.png`), fullPage: true });
  };
  const responseAfter = async (route, method, work) => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === base + route && response.request().method() === method);
    await work();
    const response = await pending;
    assert.equal(response.status(), 200, await response.text());
    const value = await response.json();
    for (const provider of ['google-drive', 'sharepoint']) assert.ok(!JSON.stringify(value).includes(folderFixture(provider).token), 'Folder API responses omit provider tokens');
    return value;
  };

  for (const provider of ['google-drive', 'sharepoint']) {
    const fixture = folderFixture(provider), label = provider === 'google-drive' ? 'Google Drive' : 'SharePoint / OneDrive';
    await open();
    await panel.getByText('Provider availability', { exact: true }).click();
    await responseAfter('/policy', 'PUT', () => panel.getByRole('button', { name: `Enable ${label}`, exact: true }).click());
    await expect(panel.getByRole('button', { name: `Disable ${label}`, exact: true })).toBeEnabled();
    await panel.getByText('Connect an account', { exact: true }).click();
    await panel.getByLabel('Folder provider', { exact: true }).selectOption(provider);
    if (provider === 'sharepoint') await panel.getByLabel('Drive ID', { exact: true }).fill(fixture.driveId);
    await panel.getByLabel('Delegated access token', { exact: true }).fill(fixture.token);
    const connected = await responseAfter('/connections', 'POST', () => panel.getByRole('button', { name: 'Connect account', exact: true }).click());
    await expect(panel.getByLabel('Delegated access token', { exact: true })).toHaveValue('');
    await expect(panel.getByRole('status')).toHaveText('Account connected. Choose a folder to preview.');
    await panel.getByLabel('Connected account', { exact: true }).selectOption(connected.value.id);
    await panel.getByLabel('Folder ID', { exact: true }).fill(fixture.root.id);
    await panel.getByLabel('Import below', { exact: true }).selectOption(destination.id);
    await shot(provider, 'connected', panel.getByLabel('Connected account', { exact: true }));

    const before = (await api('/api/pages')).items;
    const preview = await responseAfter('/preview', 'POST', () => panel.getByRole('button', { name: 'Preview folder', exact: true }).click());
    assert.equal(preview.privateAccess, 'importing-member-only');
    assert.equal(preview.report.imported.length, 12, 'Each provider has twelve readable Google Docs, Word and PDF sources');
    assert.deepEqual(preview.report.notImported.map(item => item.name).sort(), ['Budget.xlsx', 'Legal restricted']);
    assert.equal(preview.report.notImported.find(item => item.name === 'Budget.xlsx').reason, 'FOLDER_FILE_UNSUPPORTED');
    assert.equal(preview.report.notImported.find(item => item.name === 'Legal restricted').reason, 'FOLDER_SOURCE_UNREADABLE');
    assert.equal((await api('/api/pages')).items.length, before.length, 'Preview creates no pages');
    await expect(review).toContainText('Imported pages are private to you. Source sharing permissions are not copied.');
    await expect(review).toContainText('Only files readable by your connected account can cross.');
    await expect(review.locator('dl > div').filter({ hasText: 'Documents ready to import' })).toContainText('12');
    const omittedPreview = review.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Not imported/ }) });
    await expect(omittedPreview).toContainText(fixture.unsupported.name);
    await expect(omittedPreview).toContainText(fixture.denied.name);
    const previewTree = review.locator('details').filter({ has: page.getByText('Folder tree', { exact: true }) });
    for (const title of [fixture.root.name, 'Operations', 'Handover', 'Final review']) await expect(previewTree).toContainText(title);
    const leaf = preview.tree.find(item => item.sourceId === fixture.documents.at(-1).id);
    assert.equal(leaf.parentSourceId, fixture.handover.id, 'Preview preserves the nested folder parent');
    await shot(provider, 'preview-private-access', review.getByRole('heading', { name: 'Folder preview', exact: true }));
    await shot(provider, 'preview-omissions', omittedPreview.locator('summary'));

    const run = await responseAfter('/runs', 'POST', () => review.getByRole('button', { name: 'Import reviewed folder', exact: true }).click());
    assert.equal(run.state, 'completed');
    assert.equal(run.report.imported.length, 12);
    assert.deepEqual(run.report.notImported.map(item => item.name).sort(), ['Budget.xlsx', 'Legal restricted']);
    assert.ok(run.report.imported.every(item => item.pageId), 'Every successfully imported source links to its created page');
    await expect(report.getByRole('heading', { name: 'Folder import · completed', exact: true })).toBeVisible();
    await expect(report.locator('dl > div').filter({ hasText: 'Documents imported' })).toContainText('12');
    await shot(provider, 'completed-report', report.getByRole('heading'));
    const imported = id => run.report.imported.find(item => item.sourceId === id);
    const first = imported(fixture.documents[0].id), next = imported(fixture.documents[1].id), last = imported(fixture.documents.at(-1).id);
    const document = await api(`/api/pages/${first.pageId}`);
    for (const type of ['heading', 'table', 'media']) assert.ok(document.blocks.some(block => block.blockType === type), `Word/Google Docs ${type} crosses the actual importer`);
    assert.ok(JSON.stringify(document.blocks).includes(`/app/pages/${next.pageId}`), 'The provider cross-link is remapped to its Slate page');
    const pdf = await api(`/api/pages/${imported(fixture.documents[2].id).pageId}`);
    for (const type of ['heading', 'table', 'media']) assert.ok(pdf.blocks.some(block => block.blockType === type), `Tagged PDF ${type} crosses the actual importer`);
    const leafDocument = await api(`/api/pages/${last.pageId}`), parent = await api(`/api/pages/${leafDocument.parentPageId}`);
    assert.equal(parent.page.title, 'Handover');
    const grandparent = await api(`/api/pages/${parent.parentPageId}`);
    assert.equal(grandparent.page.title, 'Operations');
    const rootPage = await api(`/api/pages/${grandparent.parentPageId}`);
    assert.equal(rootPage.page.title, fixture.root.name);
    assert.equal(rootPage.parentPageId, destination.id, 'The imported folder tree remains below the selected destination');
    const denied = await context.request.get(`${origin}/api/pages/${first.pageId}`, { headers: { cookie: state.readerCookie } });
    assert.equal(denied.status(), 404, 'An unrelated full member cannot read a privately imported page');

    await page.reload({ waitUntil: 'networkidle' });
    await panel.getByLabel('Retained folder imports', { exact: true }).selectOption(run.id);
    await expect(report.getByRole('heading', { name: 'Folder import · completed', exact: true })).toBeVisible();
    const persisted = await api(`${base}/runs/${run.id}`);
    assert.deepEqual(persisted.report, run.report, 'The complete omission and document report survives a fresh request');
    const omissions = report.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Not imported/ }) });
    await expect(omissions).toContainText('Budget.xlsx');
    await expect(omissions).toContainText('Legal restricted');
    await shot(provider, 'persisted-omissions', omissions.locator('summary'));
    const documents = report.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Imported documents/ }) });
    await documents.locator('summary').click();
    await documents.getByRole('link', { name: fixture.documents[0].name, exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(fixture.documents[0].title);
    await expect(page.locator('[data-page-editor]')).toContainText('Recovery notes');
    await expect(page.locator('[data-page-editor]').getByRole('link', { name: 'Next recovery document', exact: true })).toHaveAttribute('href', `/app/pages/${next.pageId}`);
    await shot(provider, 'imported-document', page.getByRole('textbox', { name: 'Page title', exact: true }));
    await openNavigation(page);
    const tree = page.getByRole('navigation', { name: 'Pages', exact: true });
    await tree.getByRole('textbox', { name: 'Filter pages in Handbook', exact: true }).fill('Final review');
    await expect(tree.locator(`a[href="/app/pages/${last.pageId}"]`)).toBeVisible();
    await expect(tree.getByRole('link', { name: fixture.root.name, exact: true })).toBeVisible();
    await shot(provider, 'imported-tree', tree.locator(`a[href="/app/pages/${last.pageId}"]`));
    await tree.getByRole('textbox', { name: 'Filter pages in Handbook', exact: true }).fill('');
  }
  const recorded = await readFolderRequests();
  for (const provider of ['google-drive', 'sharepoint']) {
    const fixture = folderFixture(provider), calls = recorded.filter(item => item.provider === provider);
    assert.ok(calls.some(item => item.page === 'synthetic-slate-207'), 'Both provider trees follow genuine continuation pages');
    assert.ok(calls.some(item => item.pathname.includes(fixture.documents[2].id)), 'A genuine tagged PDF was requested at each provider boundary');
    assert.ok(!calls.some(item => item.pathname.includes(fixture.denied.id) && (item.pathname.endsWith('/children') || item.media)), 'Unreadable folders are not enumerated or downloaded');
    assert.ok(!calls.some(item => item.pathname.includes(fixture.unsupported.id) && (item.pathname.endsWith('/content') || item.pathname.endsWith('/export') || item.media)), 'Unsupported files are named instead of downloaded');
  }
  assertNoConsoleErrors();
}
