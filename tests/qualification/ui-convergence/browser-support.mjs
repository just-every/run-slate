import {assertNoStarterTemplatesBeforeFirstRun} from '../../e2e/templates/starter-journey.mjs';
import { testDevKey } from '../../e2e/dev-key.mjs';
import assert from 'node:assert/strict';
import { signInWithOutbox } from '../../e2e/outbox-auth.mjs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { applyMigrations, executeD1, root, stop, testSessionSecret } from '../../e2e/runtime-harness.mjs';
import { startShellWorker } from '../release-shell/runtime.mjs';
import { accessible, insideViewport, withinViewport } from './browser-evidence.mjs';
export { accessible } from './browser-evidence.mjs';

/** Test-only identity records replace mailbox possession, never successful API responses. */
export async function withWorkspace(viewport, profile, run, overrides = {}) {
  const scratchRoot = path.join(root, '.artifacts/ui-convergence');
  await mkdir(scratchRoot, { recursive: true });
  const state = await mkdtemp(path.join(scratchRoot, 'state-'));
  const network = [], consoleErrors = [], modelRequests = [], captures = new Set();
  let runtime, browser;
  try {
    await applyMigrations(state);
    const now = new Date().toISOString();
    await executeD1(state, `INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('browser-workspace','Harbor operations','','${now}','${now}','initial');
      INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('browser-owner','browser-workspace','owner@test.invalid','Alex Owner','AO','owner','member','active',1,'${now}','${now}');
      INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('browser-reader','browser-workspace','reader@test.invalid','Morgan Reader','MR','member','member','active',0,'${now}','${now}');`);
    const origin = `http://127.0.0.1:${Number(process.env.SHELL_APP_PORT ?? 57000)}`;
    const workerVars = {
      SESSION_SECRET: testSessionSecret, LOCAL_DEVELOPMENT: 'true', APP_URL: origin,
      SETUP_OWNER_EMAIL: 'owner@test.invalid', MAIL_PROVIDER: 'development', MAIL_FROM: 'owner@test.invalid', RER_DEV_KEY: testDevKey,
      MAIL_API_KEY: 'TEST-ONLY-NOT-A-PROVIDER-CREDENTIAL', AI_ENABLED: 'false',
      AI_API_KEY: '', AI_PROVIDER: '', AI_LOCAL_URL: '', AI_LOCAL_TOKEN: '',
      SLATE_PROFILE: profile, ...overrides,
    };
    let allocatedPorts;
    const startWorker = async () => {
      const started = await startShellWorker(state, workerVars, allocatedPorts);
      allocatedPorts = started.ports;
      return started;
    };
    runtime = await startWorker();
    const ownerSession=await signInWithOutbox(runtime.baseUrl,'owner@test.invalid');
    const readerSession=await signInWithOutbox(runtime.baseUrl,'reader@test.invalid');
    const token=ownerSession.cookie.split('=')[1],readerToken=readerSession.cookie.split('=')[1];
    // Software raster, one raster thread, fixed colour and text handling: captures of the same page match across browser launches.
    const rasterArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-rasterization', '--disable-lcd-text', '--font-render-hinting=none', '--force-color-profile=srgb', '--num-raster-threads=1', '--disable-partial-raster', '--disable-skia-runtime-opts'];
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic', ...rasterArgs] });
    const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'], locale: 'en-US' });
    await context.addCookies([{ name: 'slate_session', value: token, url: runtime.baseUrl }]);
    const page = await context.newPage();
    context.on('request', request => {
      if (request.method() === 'POST' && /\/api\/(ai\/ask|inquiries\/ask)/.test(request.url())) modelRequests.push(request.url());
    });
    context.on('response', response => {
      const request = response.request();
      if (!new URL(response.url()).pathname.startsWith('/api/') || request.method() === 'GET') return;
      const pending = response.text().then(body => network.push({ url: response.url(), method: request.method(), requestBody: request.postData(), status: response.status(), responseBody: body }))
        .catch(cause => network.push({ url: response.url(), error: String(cause) }));
      captures.add(pending); pending.finally(() => captures.delete(pending));
    });
    context.on('requestfailed', request => network.push({ url: request.url(), method: request.method(), failure: request.failure() }));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ url: page.url(), message: message.text() }); });
    page.on('pageerror', cause => consoleErrors.push({ url: page.url(), message: String(cause) }));
    const api = async (route, options = {}) => {
      // A fresh connection per call, as in two-people-support's call().
      const response = await context.request.get(runtime.baseUrl + route, { ...options, headers: { ...options.headers, connection: 'close' } });
      assert.equal(response.status(), 200, await response.text());
      const value = await response.json();
      network.push({ url: runtime.baseUrl + route, method: 'GET', status: response.status(), responseBody: value });
      return value;
    };
    const switchIdentity = async identity => {
      await context.clearCookies();
      await context.addCookies([{ name: 'slate_session', value: identity === 'reader' ? readerToken : token, url: runtime.baseUrl }]);
    };
    const records = async () => {
      // The emitted Worker and Wrangler CLI must not own persisted SQLite together.
      // These explicit read-only checkpoints interrupt the Worker after UI requests finish.
      await page.waitForLoadState('networkidle');
      await Promise.all([...captures]);
      await stop(runtime.child);
      runtime = undefined;
      let result, failure;
      try {
        [result] = await executeD1(state, "SELECT (SELECT COUNT(*) FROM workspaces) AS workspaces, (SELECT COUNT(*) FROM containers WHERE visibility!='personal') AS spaces, (SELECT COUNT(*) FROM pages) AS pages");
      } catch (cause) {
        failure = cause;
      }
      try {
        runtime = await startWorker();
      } catch (cause) {
        failure = failure ? new AggregateError([failure, cause], 'Persisted count checkpoint and Worker restart failed') : cause;
      }
      if (failure) throw failure;
      return result.results[0];
    };
    try {
      await run({ page, context, origin: runtime.baseUrl, api, records, switchIdentity, modelRequests, readerCookie: `slate_session=${readerToken}` });
    } catch (cause) {
      await accessible(page, `${profile} journey failure`).catch(() => {});
      await Promise.allSettled([...captures]);
      // A label that never changed looks the same whether the click did nothing or the server rejected it; say which.
      console.error('Journey failure context', JSON.stringify({ rejected: network.filter(entry => entry.error || entry.status >= 400).slice(-10), consoleErrors: consoleErrors.slice(-10) }, null, 2).slice(0, 8000));
      throw cause;
    }
    assert.deepEqual(modelRequests, [], 'This no-provider suite must never submit model work.');
  } finally {
    try {
      await Promise.allSettled([...captures]);
      const artifact = JSON.parse(await readFile(path.join(root, '.cache/slate/build-source.json'), 'utf8'));
      await writeFile(path.join(scratchRoot, `${profile}-${viewport.width}-network.json`), JSON.stringify({
        fixture: 'Identity-only D1 records and native development outbox sessions; no spaces, pages, invitations or application responses are seeded.',
        artifact, viewport, profile, network, consoleErrors, modelRequests,
      }, null, 2));
    } finally {
      try { await browser?.close(); }
      finally {
        try { if (runtime) await stop(runtime.child); }
        finally { await rm(state, { recursive: true, force: true }); }
      }
    }
  }
}

export async function setupWorkspace(state) {
  const {page,origin,api,records}=state;
  await assertNoStarterTemplatesBeforeFirstRun(state);
  await page.goto(origin + '/app', { waitUntil: 'networkidle' });
  assert.deepEqual(await records(), { workspaces: 1, spaces: 0, pages: 0 }, 'The fixture supplies identity only before first run.');
  await expect(page.getByRole('heading', { name: 'Name this workspace', exact: true })).toBeVisible();
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue('');
  assert.equal(await page.getByLabel('Workspace name', { exact: true }).evaluate(input => input.placeholder), '');
  await expect(page.getByTestId('member-email')).toHaveText('owner@test.invalid');
  await expect(page.locator('body')).not.toContainText(/Aurora Android Launch|Jamie Park|Customer Success|How we handle an escalation/);
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeDisabled();
  await accessible(page, 'first-run workspace');
  await insideViewport(page, next, 'Disabled first-run Continue');
  await page.getByLabel('Workspace name', { exact: true }).fill('Field notes');
  await expect(next).toBeEnabled();
  await withinViewport(page, next, 'First-run Continue');
  const buttonStyle = await next.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, height: element.getBoundingClientRect().height }));
  assert.notEqual(buttonStyle.background, 'rgba(0, 0, 0, 0)', 'Continue has a visible button surface.');
  assert.ok(buttonStyle.height >= 32);
  await next.click();
  await expect(page.getByLabel('Space name', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('First page title')).toHaveValue('');
  await expect(next).toBeDisabled();
  const placeholders = await page.locator('input').evaluateAll(inputs => inputs.map(input => input.placeholder));
  assert.ok(placeholders.every(placeholder => placeholder === ''), 'First-run names have no value-like placeholders.');
  assert.ok(!placeholders.includes('Customer Success') && !placeholders.includes('How we handle an escalation'));
  await accessible(page, 'first-run space');
  await insideViewport(page, next, 'Disabled first-space Continue');
  await page.getByLabel('Space name', { exact: true }).fill('Handbook');
  await expect(next).toBeDisabled();
  await page.getByLabel('First page title').fill('Welcome');
  await withinViewport(page, next, 'First-space Continue');
  await next.click();
  await accessible(page, 'first-run invitations');
  await page.getByRole('button', { name: 'Skip this step' }).click();
  await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toBeVisible();
  assert.deepEqual(await records(), { workspaces: 1, spaces: 1, pages: 1 }, 'First run creates exactly one workspace, non-personal space and page.');
  const workspace = await api('/api/workspace');
  const spaces = await api('/api/containers');
  const pages = await api('/api/pages');
  assert.equal(workspace.name, 'Field notes');
  assert.deepEqual(spaces.items.filter(space => space.visibility !== 'personal').map(space => space.name), ['Handbook']);
  assert.deepEqual(pages.items.map(item => item.title), ['Welcome']);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Welcome');
  await expect(page.getByTestId('workspace-name')).toHaveText('Field notes');
  await accessible(page, 'first page');
}

export async function openNavigation(page) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
}

export async function closeDetails(page) {
  await page.locator('.detail-close').click();
}

/** The phone reaches secondary page actions through the real More menu. */
export async function openPageAction(page, name) {
  const desktopAction = page.locator('.page-topbar').getByRole('button', { name, exact: true });
  if (await desktopAction.isVisible()) await desktopAction.click();
  else {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menu').getByRole('menuitem', { name, exact: true }).click();
  }
}
