import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {copiedRuntime} from './copied-runtime.mjs';

const evidence = process.env.QUAL_EVIDENCE;
assert.ok(evidence && process.env.QUAL_RESTORED_STATE, 'QUAL_EVIDENCE and QUAL_RESTORED_STATE required');
let runtime, browser;
const result = {requests: [], consoleErrors: [], pageErrors: []};
try {
  runtime = await copiedRuntime({root: process.cwd(), evidence, source: process.env.QUAL_RESTORED_STATE, appPort: 59800, inspectorPort: 59801});
  browser = await chromium.launch({headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  // Native magic-link acceptance supplies only mailbox possession; no response interception.
  assert.equal((await context.request.get(runtime.origin+'/api/auth/magic/accept?token='+runtime.token)).status(), 200);
  const page = await context.newPage();
  const records = new Map();
  const start = Date.now();
  let tree;
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    const record = {path: url.pathname, method: request.method(), start: Date.now()-start};
    records.set(request, record); result.requests.push(record);
  });
  page.on('response', response => {const record = records.get(response.request()); if (record) record.status = response.status();});
  page.on('requestfinished', request => {const record = records.get(request); if (record) record.end = Date.now()-start;});
  page.on('requestfailed', request => {const record = records.get(request); if (record) record.failed = request.failure();});
  page.on('console', message => {if (message.type() === 'error') result.consoleErrors.push(runtime.sanitize(message.text()));});
  page.on('pageerror', error => result.pageErrors.push(runtime.sanitize(error.stack)));
  const treeResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'GET');
  await page.goto(runtime.origin+'/app/pages/'+runtime.target.id);
  await page.getByRole('textbox', {name: 'Page title', exact: true}).waitFor();
  await page.locator('[data-block-id]').filter({hasText: 'Final stage impact assessment'}).first().waitFor();
  result.bodyReadyMs = Date.now()-start;
  const idleStart = Date.now();
  await page.waitForLoadState('networkidle');
  result.networkidleMs = Date.now()-idleStart;
  tree = await (await treeResponse).json();
  const parents = new Set(tree.items.map(item => item.parentPageId).filter(Boolean));
  result.pageListReads = result.requests.filter(record => record.method === 'GET' && record.path === '/api/pages').length;
  result.expansionReads = result.requests.filter(record => record.method === 'GET' && record.path.endsWith('/expansion'));
  result.leafExpansionReads = result.expansionReads.filter(record => !parents.has(record.path.split('/')[3]));
  result.title = await page.getByRole('textbox', {name: 'Page title', exact: true}).inputValue();
  assert.equal(result.title, runtime.target.title);
  await page.getByText('Recently opened', {exact: true}).click();
  await page.locator('aside.sidebar details').filter({has: page.locator('summary', {hasText: 'Recently opened'})}).getByRole('link', {name: runtime.target.title, exact: true}).waitFor();
  result.recentsUpdated = true;
  const anonymous = await browser.newContext();
  result.anonymousStatus = (await anonymous.request.get(runtime.origin+'/api/pages/'+runtime.target.id)).status();
  await anonymous.close();
  assert.equal(result.anonymousStatus, 401);
  await page.screenshot({path: path.join(evidence, 'restored-page.jpg')});
  assert.deepEqual(result.consoleErrors, []);
  assert.deepEqual(result.pageErrors, []);
  assert.equal(result.pageListReads, 1, 'Opening a page must not refetch its unchanged tree');
  assert.equal(result.leafExpansionReads.length, 0, 'True leaves have no expansion preference to read');
  result.passed = true;
} catch (error) {result.error = error.stack; process.exitCode = 1;}
finally {
  await browser?.close();
  await runtime?.close();
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({...result, requests: result.requests.length, expansionReads: result.expansionReads?.length, leafExpansionReads: result.leafExpansionReads?.length}, null, 2));
}
