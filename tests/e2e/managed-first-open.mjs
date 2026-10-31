import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { inbox, newOutboxLink } from './outbox-auth.mjs';
import { requestWithHost } from './runtime-harness.mjs';

/** RER's bootstrap request, then the owner's own email sign-in and first edit. */
export async function managedFirstOpen(origin, token, email = 'owner@example.test') {
  const shots = process.env.SLATE_OWNER_SHOTS;
  if (shots) await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.SLATE_CHROMIUM_PATH ? { executablePath: process.env.SLATE_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] });
  try {
    // No client script or session is needed to see an unclaimed installation.
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: width === 1440 ? 1000 : 844 } });
      try {
        const page = await context.newPage();
        await lobbyScreen(page, context, origin, 'unclaimed', width, shots);
      } finally { await context.close(); }
    }
    const claim = await fetch(origin + '/auth/bootstrap', {
      method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ token, displayName: 'Owner', returnTo: '/' }),
    });
    assert.equal(claim.status, 303, 'RER claims the native owner');
    const replay = await fetch(origin + '/auth/bootstrap', {
      method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ token, displayName: 'Owner', returnTo: '/' }),
    });
    assert.equal(replay.status, 409, 'The claim cannot replace an existing workspace');

    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 } });
      try {
        const page = await context.newPage();
        const shot = async name => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          if (shots) await page.screenshot({ path: path.join(shots, `${name}-${width}.png`), fullPage: true });
        };
        await lobbyScreen(page, context, origin, 'claimed', width);
        assert.equal(await page.getByRole('link', { name: 'Finish setup' }).count(), 0);
        await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
        await shot('claimed');
        await page.goto(origin + '/signin?login_hint=' + encodeURIComponent(email), { waitUntil: 'networkidle' });
        assert.equal(await page.getByLabel('Email address', { exact: true }).inputValue(), email);
        await shot('first-open');
        const before = await inbox(origin);
        await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
        await page.getByRole('heading', { name: 'Check your email' }).waitFor();
        // The address is a separate inline element; its preceding text must end in whitespace.
        assert.match(await page.locator('.paper-sent strong').evaluate(node => node.previousSibling.textContent), /\s$/);
        await shot('email-sent');
        await page.goto(await newOutboxLink(origin, before));
        await page.getByRole('button', { name: 'Confirm', exact: true }).click();
        await page.waitForURL(url => url.pathname === '/app');
        const api = async url => { const response = await context.request.get(origin + url); assert.equal(response.status(), 200); return response.json(); };
        assert.equal((await api('/api/session')).member.email, email);
        // A real native session still buys no identity disclosure at either public door.
        const signedInState = await context.request.get(origin + '/setup/state');
        assert.deepEqual(await signedInState.json(), { state: 'claimed' });
        const signedInLobby = await context.request.get(origin + '/');
        const anonymousLobby = await fetch(origin + '/');
        assert.equal(await signedInLobby.text(), await anonymousLobby.text());
        assert.equal((await api('/api/workspace/first-run')).required, false);
        const workspace = await api('/api/workspace');
        assert.equal(workspace.name, 'Slate');
        const spaces = (await api('/api/containers')).items.filter(item => item.visibility !== 'personal');
        assert.equal(spaces.length, 1);
        await shot('workspace-ready');
        const pages = (await api('/api/pages?containerId=' + spaces[0].id)).items;
        assert.equal(pages.length, 1);
        await page.goto(origin + '/app/pages/' + pages[0].id, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'Welcome', exact: true }).waitFor();
        await shot('welcome-page');
        const rename = await context.request.put(origin + '/api/workspace', {
          headers: { origin }, data: { operationKey: randomUUID(), expectedRevisionId: workspace.revisionId, name: 'Slate', mark: workspace.mark, description: workspace.description, guestAccess: workspace.guestAccess, publicLinkAccess: workspace.publicLinkAccess, anonymousAccess: workspace.anonymousAccess, policies: workspace.policies },
        });
        assert.equal(rename.status(), 200, 'The default workspace remains owner-editable');
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}

/** Installed public doors, observed in the actual emitted Worker and browser. */
async function lobbyScreen(page, context, origin, state, width, shots) {
  const requests = [];
  const observe = request => requests.push({ url: request.url(), kind: request.resourceType() });
  page.on('request', observe);
  try {
    const response = await page.goto(origin + '/', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: state === 'claimed' ? 'Sign in' : 'Finish setup', exact: true }).waitFor();
    if (width === 1440) {
      assert.equal(response.status(), 200);
      assert.match(response.headers()['cache-control'], /no-store/);
      assert.equal(response.headers()['set-cookie'], undefined);
      assert.equal(await page.locator('.btn').count(), 1);
      assert.equal(await page.locator('.btn').getAttribute('href'), state === 'claimed' ? '/signin' : '/setup');
      assert.equal(await page.locator('[data-rer-name]').textContent(), 'Slate');
      assert.match(await page.locator('.line').textContent(), /Slate/);
      for (const selector of ['.mark', '.door-art img']) {
        assert.equal(await page.locator(selector).evaluate(image => image.complete && image.naturalWidth > 0), true, selector);
      }
      assert.equal(await page.locator('script').count(), 0);
      assert.equal(requests.every(request => new URL(request.url).origin === origin && request.kind !== 'script'), true, JSON.stringify(requests));
      assert.deepEqual(await context.cookies(), []);
      for (const requestPath of ['/', '/setup/state']) {
        const current = await context.request.get(origin + requestPath);
        assert.match(current.headers()['cache-control'], /no-store/);
        assert.equal(current.headers()['set-cookie'], undefined);
        if (requestPath === '/setup/state') assert.deepEqual(await current.json(), { state });
        const foreign = await requestWithHost(origin, requestPath, 'foreign.test');
        assert.equal(foreign.status, 404);
        assert.equal(foreign.headers['set-cookie'], undefined);
        assert.doesNotMatch(foreign.body, /claimed|Owner|example\.test/);
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (shots) await page.screenshot({ path: path.join(shots, `${state}-${width}.png`), fullPage: true });
  } finally { page.off('request', observe); }
}
