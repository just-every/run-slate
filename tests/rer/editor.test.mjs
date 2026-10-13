import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fixtureProvider} from './management-fixture.mjs';
import {withWorkspace} from '../qualification/ui-convergence/browser-support.mjs';
for (const width of [1440, 390]) test(`native owner editor mount, CSP and revocation at ${width}`, {timeout: 180_000}, async () => {
  const provider = await fixtureProvider();
  try {
    await withWorkspace({width, height: width === 1440 ? 1000 : 844}, 'core-wiki', async ({page, context, origin, readerCookie, switchIdentity}) => {
      provider.state.allowed = origin;
      const anonymous = await fetch(origin + '/api/editor/config');
      assert.equal(anonymous.status, 401);
      const reader = await fetch(origin + '/api/editor/config', {headers: {cookie: readerCookie}});
      assert.equal(reader.status, 403);
      const response = await context.request.get(origin + '/api/editor/config');
      assert.equal(response.status(), 200); assert.equal(response.headers()['cache-control'], 'no-store');
      const grant = await response.json();
      assert.deepEqual(Object.keys(grant).sort(), ['config', 'expiresAt']);
      assert.equal(grant.config.installationId, 'slate_fixture');
      assert.ok(grant.expiresAt > Date.now(), 'the authorized owner receives a live grant');
      const document = await page.goto(origin + '/app', {waitUntil: 'networkidle'});
      const csp = document.headers()['content-security-policy'];
      assert.ok(csp.includes(`frame-ancestors 'self' ${provider.origin}`));
      assert.ok(csp.includes(`frame-src 'self' ${provider.origin}`));
      await page.getByRole('button', {name: 'Open Run Edit Run', exact: true}).click();
      await page.waitForFunction(() => document.querySelector('[data-rer-editor]')?.dataset.connection === 'connected');
      const frame = page.frames().find(item => item.url().startsWith(provider.origin)); assert.ok(frame);
      const management = await fetch(frame.url());
      assert.equal(management.headers.get('content-security-policy'), `frame-ancestors ${origin}`);
      // Live overlay is applied by the copied runtime after the real leaf hydrates.
      const heading = page.getByRole('heading', {name: 'Name this workspace', exact: true});
      const selector = await heading.evaluate(element => {const parts = []; for (let node = element; node && node.tagName !== 'HTML'; node = node.parentElement) parts.unshift(node.tagName.toLowerCase() + ':nth-child(' + (Array.from(node.parentElement.children).indexOf(node) + 1) + ')'); return parts.join(' > ');});
      await frame.evaluate(snapshot => window.send('live-edits', {snapshot}), {revision: 1, edits: [{id: 'owner-preview', revision: 1, path: new URL(page.url()).pathname, parentOrigin: origin, target: {selector, tag: 'h1', role: '', beforeText: 'Name this workspace'}, change: {text: 'Owner visual preview'}}]});
      await page.getByRole('heading', {name: 'Owner visual preview', exact: true}).waitFor();
      await mkdir('.artifacts/rer-editor', {recursive: true});
      await page.screenshot({path: `.artifacts/rer-editor/${width}.png`, fullPage: true});
      await page.getByRole('link', {name: 'Slate', exact: true}).click();
      await page.waitForURL(origin + '/');
      await page.locator('[data-rer-editor]').waitFor({state: 'detached', timeout: 1000});
      assert.equal(await page.locator('[data-rer-editor]').count(), 0);
      await page.goto(origin + '/app', {waitUntil: 'networkidle'});
      await page.getByRole('button', {name: 'Open Run Edit Run', exact: true}).waitFor();
      await switchIdentity('reader');
      await page.goto(origin + '/app', {waitUntil: 'networkidle'});
      assert.equal(await page.locator('[data-rer-editor]').count(), 0);
      await switchIdentity('owner');
      await page.goto(origin + '/app', {waitUntil: 'networkidle'});
      await page.getByRole('button', {name: 'Open Run Edit Run', exact: true}).waitFor();
      // Real native logout; a short grant bounds changes made outside this browser transport.
      const logout = await context.request.post(origin + '/api/auth/logout', {headers: {origin}});
      assert.equal(logout.status(), 204);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(() => !document.querySelector('[data-rer-editor]'));
      assert.equal((await context.request.get(origin + '/api/editor/config')).status(), 401);
      await page.getByRole('heading', {name: 'Name this workspace', exact: true}).waitFor();
    }, {RER_MANAGEMENT_ORIGIN: provider.origin, RER_INSTALLATION_ID: 'slate_fixture'});
  } finally {await provider.close();}
});
