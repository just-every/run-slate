import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { command } from '../qualification/local/process.mjs';
import { cardGeometry, landingProduct } from './landing-product.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = path.join(root, 'dist', 'site');
const proof = process.env.SLATE_LANDING_PROOF_DIR ?? path.join(root, '.artifacts/landing');
const mime = { '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.js': 'text/javascript' };

/** Build through the public command, rather than rendering a component in a test. */
export async function buildLandingSite(cwd = root) {
  await command('pnpm', ['exec', 'rer', 'build', '--site'], { cwd, timeout: 180000 });
}

/** Serve only the actual emitted bytes, recording requests even when browser scripts are disabled. */
async function serveSite(folder = site) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    requests.push({ path: pathname, method: request.method, cookie: request.headers.cookie ?? null });
    try {
      let file = path.resolve(folder, '.' + decodeURIComponent(pathname));
      assert.ok(file.startsWith(folder + path.sep) || file === folder);
      // Match the static host's automatic HTML resolution for extensionless public routes.
      if (!path.extname(file) && (await stat(file + '.html').catch(() => null))?.isFile()) file += '.html';
      else if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, origin: `http://127.0.0.1:${server.address().port}` };
}

export function assertNoListing(html, markers = []) {
  for (const marker of markers) assert.ok(!html.includes(marker), `Public root exposed ${marker}`);
  assert.doesNotMatch(html, /(?:href|src)=["'][^"']*\/p\//i, 'A root must not enumerate published pages');
}

/** One desktop assertion journey; the phone proof uses this same door outside the registration. */
export async function landingBrowser({ width = 1440 } = {}) {
  await buildLandingSite();
  const { server, requests, origin } = await serveSite();
  let browser;
  const observations = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.SLATE_CHROMIUM_PATH ? { executablePath: process.env.SLATE_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] });
    // With scripts enabled as well, an accidental tracking script must fail the resource check.
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ javaScriptEnabled, colorScheme: 'dark', reducedMotion: 'reduce', viewport: { width, height: 1000 }, serviceWorkers: 'block' });
      try {
        const page = await context.newPage();
        const resources = [], responses = [], errors = [];
        page.on('request', request => resources.push({ url: request.url(), type: request.resourceType(), method: request.method() }));
        page.on('response', response => responses.push({ url: response.url(), status: response.status(), cookie: response.headers()['set-cookie'] ?? null }));
        page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(origin, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200);
        const html = await response.text();
        assertNoListing(html, ['Aurora Android Launch', 'Jamie Park', 'synthetic-slate-private-record', 'synthetic-slate-published-record']);
        assert.doesNotMatch(html, /<script\b|<iframe\b|<form\b|<img\b|<video\b|<audio\b|<object\b|<embed\b/i, 'The landing needs no executable or remote media');
        const text = await page.locator('body').innerText();
        const withoutSeatDisclaimer = text.replace(/no per-seat pricing\.?/gi, '');
        assert.doesNotMatch(withoutSeatDisclaimer, /\b(?:testimonials?|customers?|subscribers?|pricing|plans)\b|[$€£]\s*\d|\d[\d,.]*\s*(?:USD|EUR|GBP|per seat|per month|users|teams|companies)\b/i);
        assert.equal(await page.locator('blockquote, [itemtype*="Review"], [itemtype*="Offer"]').count(), 0);
        assert.deepEqual(await context.cookies(), []);
        assert.deepEqual(errors, []);

        // Scroll every section into view, so offscreen reveal effects cannot hide unreadable content.
        const sections = page.locator('.slate-landing header, .slate-landing main section, .slate-landing footer');
        assert.ok(await sections.count() > 0);
        const painted = [];
        for (const section of await sections.all()) {
          await section.scrollIntoViewIfNeeded();
          assert.equal(await section.isVisible(), true);
          const state = await section.evaluate(element => {
            const color = value => value.match(/[\d.]+/g)?.map(Number) ?? [];
            const luminance = rgb => rgb.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
            const background = node => {
              for (let current = node; current; current = current.parentElement) {
                const rgb = color(getComputedStyle(current).backgroundColor);
                if (rgb.length === 3 || rgb[3] === 1) return rgb;
              }
              return [255, 255, 255];
            };
            const visible = node => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
            // A compact header may hide a duplicate navigation link that remains visible in the footer.
            const duplicatedLink = node => node.matches('a') && !visible(node) && [...document.querySelectorAll('a')].some(other => other !== node && other.href === node.href && visible(other));
            const text = [...element.querySelectorAll('h1, h2, h3, p, li, a, .eyebrow')].filter(node => node.textContent.trim() && !node.closest('svg, [aria-hidden="true"], [role="img"]') && !duplicatedLink(node)).map(node => {
              const style = getComputedStyle(node), rect = node.getBoundingClientRect();
              const ink = luminance(color(style.color)), paper = luminance(background(node));
              return { text: node.textContent.trim(), size: parseFloat(style.fontSize), contrast: (Math.max(ink, paper) + .05) / (Math.min(ink, paper) + .05), visible: rect.width > 0 && rect.height > 0 && visible(node), contained: rect.left >= -1 && rect.right <= innerWidth + 1 };
            });
            const animated = [...element.querySelectorAll('*'), element].filter(node => getComputedStyle(node).animationName !== 'none' || getComputedStyle(node).transitionDuration.split(',').some(duration => parseFloat(duration) > 0));
            return { id: element.id || element.tagName, text, animated: animated.length };
          });
          assert.ok(state.text.length, `${state.id} has readable content`);
          assert.equal(state.animated, 0, `${state.id} honors reduced motion`);
          for (const item of state.text) {
            assert.ok(item.visible && item.contained, `${state.id}: ${item.text} is visible without scripts`);
            assert.ok(item.size >= 13, `${state.id}: ${item.text} is readable at ${item.size}px`);
            assert.ok(item.contrast >= (item.size >= 24 ? 3 : 4.5), `${state.id}: ${item.text} contrast ${item.contrast}`);
          }
          painted.push(state);
        }
        const palette = await page.locator('.slate-landing').evaluate(element => ({ paper: getComputedStyle(element).backgroundColor, ink: getComputedStyle(element).color, scheme: getComputedStyle(element).colorScheme, overflow: document.documentElement.scrollWidth > innerWidth }));
        assert.equal(palette.scheme, 'light');
        assert.equal(palette.overflow, false);
        // Compare the painted palette after an actual preference change, not stylesheet declarations.
        await page.emulateMedia({ colorScheme: 'light' });
        const light = await page.locator('.slate-landing').evaluate(element => ({ paper: getComputedStyle(element).backgroundColor, ink: getComputedStyle(element).color }));
        assert.deepEqual(light, { paper: palette.paper, ink: palette.ink });
        assert.ok(Number(palette.paper.match(/\d+/)[0]) > 200, 'The fixed palette is light');
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.evaluate(() => scrollTo(0, 0));
        await mkdir(proof, { recursive: true });
        await page.screenshot({ path: path.join(proof, `landing-${width}-${javaScriptEnabled ? 'scripts' : 'no-scripts'}.png`), fullPage: true });
        for (const resource of resources) {
          assert.equal(new URL(resource.url).origin, origin, resource.url);
          assert.ok(['document', 'stylesheet', 'font', 'image'].includes(resource.type), JSON.stringify(resource));
          assert.equal(resource.method, 'GET');
          const pathname = new URL(resource.url).pathname;
          assert.ok(pathname === '/' || /^(?:\/site-assets\/[^/]+\.css|\/fonts\/(?:fonts\.css|outfit\/[^/]+\.woff2)|\/(?:favicon(?:-32\.png|\.svg|\.ico)|apple-touch-icon\.png))$/.test(pathname), `Unexpected resource ${pathname}`);
        }
        assert.ok(resources.some(resource => resource.type === 'stylesheet'));
        assert.ok(resources.some(resource => resource.type === 'font'));
        assert.ok(responses.every(response => response.status === 200 && response.cookie === null), JSON.stringify(responses));
        observations.push({ width, javaScriptEnabled, palette, sections: painted, resources, responses });
      } finally { await context.close(); }
    }
    await landingProduct(browser, { root, site, origin, width, proof, build: buildLandingSite, serve: serveSite });
    assert.ok(requests.every(request => request.cookie === null && request.method === 'GET'));
    await writeFile(path.join(proof, `landing-${width}.json`), JSON.stringify({ observations, requests }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

/** A nonempty native publication proves privacy, rather than an absence check against an empty workspace. */
export async function publishedRootPrivacy(origin, cookie) {
  const request = async (route, data) => {
    const response = await fetch(origin + route, { method: data ? 'POST' : 'GET', headers: { cookie, origin, 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify({ operationKey: randomUUID(), ...data }) } : {}) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  };
  const identities = (await request('/api/members')).items.flatMap(member => [member.id, member.displayName, member.email]);
  const workspace = await request('/api/workspace');
  assert.ok(identities.length > 0 && workspace.name, 'Privacy is checked against populated native identities');
  const container = await request('/api/containers', { name: 'synthetic-slate-private-record' });
  const title = 'synthetic-slate-published-record', text = 'synthetic-slate-published-body';
  const created = await request('/api/pages', { containerId: container.value.id, title, blocks: [{ id: randomUUID(), blockType: 'paragraph', treePosition: 'a0', content: { text: [{ text }] } }] });
  const id = created.value.pageId;
  let document = await request(`/api/pages/${id}`);
  if (!document.page.publishedRevisionId) {
    await request(`/api/pages/${id}/publish`, { expectedRevisionId: document.page.revisionId });
    document = await request(`/api/pages/${id}`);
  }
  const slug = `synthetic-slate-${randomUUID()}`;
  const exposure = { expectedRevisionId: document.page.revisionId, host: new URL(origin).host, slug, theme: 'light' };
  await request(`/api/publishing/${id}`, exposure);
  const publicPath = `/p/${slug}`;
  const published = await fetch(origin + publicPath);
  assert.equal(published.status, 200);
  const publicHtml = await published.text();
  assert.ok(publicHtml.includes(title) && publicHtml.includes(text), 'An anonymous reader receives the real published revision');
  const markers = [title, text, id, slug, 'synthetic-slate-private-record', ...identities, workspace.id, workspace.name];
  // Both anonymous and signed-in visits to the public root reveal no workspace listing.
  for (const headers of [{}, { cookie }]) {
    const lobby = await fetch(origin, { headers });
    assert.equal(lobby.status, 200);
    assert.equal(lobby.headers.get('set-cookie'), null);
    assertNoListing(await lobby.text(), markers);
  }
  await buildLandingSite();
  assertNoListing(await readFile(path.join(site, 'index.html'), 'utf8'), markers);
  const landingCards = cardGeometry(await readFile(path.join(site, 'index.html'), 'utf8'), 'brand-mark');
  const signin = await fetch(origin + '/signin');
  assert.equal(signin.status, 200);
  assert.deepEqual(cardGeometry(await signin.text(), 'paper-brand'), landingCards);
  const browser = await chromium.launch({ headless: true, ...(process.env.SLATE_CHROMIUM_PATH ? { executablePath: process.env.SLATE_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      await context.addCookies(cookie.split('; ').map(part => { const [name, ...value] = part.split('='); return { name, value: value.join('='), url: origin }; }));
      const page = await context.newPage();
      const app = await page.goto(origin + '/app');
      assert.equal(app.status(), 200);
      await page.locator('[data-testid="nav-workspace"] .brand-mark').waitFor();
      assert.deepEqual(cardGeometry(await page.content(), 'brand-mark'), landingCards);
      assert.equal(await page.locator('[data-testid="workspace-name"]').innerText(), workspace.name);
    } finally { await context.close(); }
  } finally { await browser.close(); }
  // Withdrawal is immediate; retrying it cannot resurrect the published capture or list it at a root.
  const withdrawal = { ...exposure, operationKey: randomUUID(), revoke: true };
  await request(`/api/publishing/${id}`, withdrawal);
  await request(`/api/publishing/${id}`, withdrawal);
  const withdrawn = await fetch(origin + publicPath);
  assert.equal(withdrawn.status, 404);
  const unavailable = await withdrawn.text();
  assertNoListing(unavailable, [title, text]);
  assertNoListing(await (await fetch(origin)).text(), markers);
  console.log('PROBE HOME-003 acceptance 2: native anonymous publication -> 200 with content; both roots omit it; withdrawal replay -> 404 without content');
}
