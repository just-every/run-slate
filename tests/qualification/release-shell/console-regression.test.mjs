import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {chromium} from '@playwright/test';
import {applyMigrations, localSampleVars, signInLocally, stop} from '../../e2e/runtime-harness.mjs';
import {startShellWorker} from './runtime.mjs';

test('WORK-013 SEARCH-001 WORK-011 — core-wiki native pages remain free of browser console and uncaught errors', {timeout: 180000}, async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), 'slate-console-'));
  let runtime, browser;
  try {
    await applyMigrations(state);
    runtime = await startShellWorker(state, {...localSampleVars, SLATE_PROFILE: 'core-wiki'});
    const {cookie} = await signInLocally(runtime.baseUrl);
    const first = await fetch(runtime.baseUrl+'/api/workspace/first-run', {method: 'POST', headers: {cookie, origin: runtime.baseUrl, 'content-type': 'application/json'}, body: JSON.stringify({operationKey: crypto.randomUUID(), workspaceName: 'Console regression', containerName: 'Documentation', pageTitle: 'Working page'})});
    assert.equal(first.status, 200, await first.clone().text());
    const {value: {pageId}} = await first.json();
    browser = await chromium.launch({headless: true});
    const context = await browser.newContext();
    const [name, value] = cookie.split('=');
    await context.addCookies([{name, value, url: runtime.baseUrl}]);
    const page = await context.newPage(), failures = [];
    page.on('console', message => {if (message.type() === 'error') failures.push(message.text());});
    page.on('pageerror', error => failures.push(String(error)));
    for (const route of ['/app', `/app/pages/${pageId}`, '/app/search', '/app/settings']) {
      const response = await page.goto(runtime.baseUrl+route, {waitUntil: 'networkidle'});
      assert.equal(response.status(), 200);
      assert.equal(await page.getByRole('main').count(), 1);
      await page.reload({waitUntil: 'networkidle'});
      assert.deepEqual(failures, [], route);
    }
  } finally {
    await browser?.close();
    if (runtime) await stop(runtime.child);
    await rm(state, {recursive: true, force: true});
  }
});
