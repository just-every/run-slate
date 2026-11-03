import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'parse5';
import { ownerIdentity } from '../../src/ext/config.ts';

const source = 'https://github.com/just-every/run-slate';
const credit = 'https://runeditrun.com';
const sections = ['top', 'open-source', 'pages', 'databases', 'search', 'sharing', 'history', 'included', 'move-in', 'start'];
const semantics = {
  top: /pages, databases and search.*wiki/is,
  'open-source': /open source.*MIT/is,
  pages: /heading.*mention.*nest/is,
  databases: /table.*board.*chart.*filter.*sort.*group/is,
  search: /search.*only sees what they're allowed to open/is,
  sharing: /people, groups.*guests.*expire.*publish.*web/is,
  history: /revisions.*compare.*restore/is,
  'move-in': /Notion.*Confluence.*Markdown.*HTML.*Word/is,
  start: /pages, databases and search.*open-source wiki/is,
};

// Geometry, rather than CSS colors, identifies the shared cards across themed surfaces.
export function cardGeometry(html, brandClass) {
  const document = parse(html);
  const all = node => [node, ...(node.childNodes ?? []).flatMap(all)];
  const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
  const brand = all(document).find(node => attr(node, 'class')?.split(/\s+/).includes(brandClass));
  assert.ok(brand, `Missing ${brandClass} branding`);
  const rects = all(brand).filter(node => node.tagName === 'rect');
  assert.equal(rects.length, 2, 'The shared mark contains the two cards');
  return rects.map(node => Object.fromEntries(['x', 'y', 'width', 'height', 'rx', 'transform'].map(key => [key, attr(node, key) ?? ''])));
}

async function identityAndIcons(page, context, origin, identity, root) {
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('h1').innerText(), identity.name);
  for (const selector of ['header .brand', 'footer .brand']) {
    const brand = page.locator(selector);
    assert.equal((await brand.innerText()).trim(), identity.name);
    assert.equal(await brand.locator('svg rect').count(), 2);
  }
  assert.equal(await page.locator('footer .footer-about').innerText(), identity.description);
  const html = await page.content();
  const cards = cardGeometry(html, 'brand-mark');
  assert.deepEqual(cardGeometry(await page.locator('footer .brand').evaluate(element => element.outerHTML), 'brand-mark'), cards);
  const svgLink = page.locator('link[rel="icon"][type="image/svg+xml"]');
  const pngLink = page.locator('link[rel="icon"][type="image/png"]');
  const appleLink = page.locator('link[rel="apple-touch-icon"]');
  for (const [link, file, dimension] of [[svgLink, 'favicon.svg'], [pngLink, 'favicon-32.png', 32], [appleLink, 'apple-touch-icon.png', 180], [page.locator('link[rel="shortcut icon"]'), 'favicon.ico']]) {
    assert.equal(await link.count(), 1);
    const target = new URL(await link.getAttribute('href'), origin);
    assert.equal(target.origin, origin);
    const response = await context.request.get(target.href);
    assert.equal(response.status(), 200);
    const body = await response.body();
    assert.deepEqual(body, await readFile(path.join(root, 'public', file)), `The build serves its own ${file}`);
    if (dimension) {
      assert.match(response.headers()['content-type'], /^image\/png/);
      assert.deepEqual([...body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(body.readUInt32BE(16), dimension);
      assert.equal(body.readUInt32BE(20), dimension);
    } else if (file.endsWith('.svg')) {
      assert.match(response.headers()['content-type'], /^image\/svg\+xml/);
      assert.deepEqual(cardGeometry(`<span class="brand-mark">${body.toString()}</span>`, 'brand-mark'), cards);
    }
  }
  const iconAgreement = await page.evaluate(async () => {
    const load = async source => { const image = new Image(); image.src = source; await image.decode(); return image; };
    const svg = await load('/favicon.svg');
    const scores = [];
    for (const [file, size, inset] of [['/favicon-32.png', 32, 0], ['/apple-touch-icon.png', 180, .16]]) {
      const raster = await load(file);
      const mask = (image, padding) => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        const side = Math.round(size * (1 - 2 * padding));
        context.drawImage(image, (size - side) / 2, (size - side) / 2, side, side);
        const pixels = context.getImageData(0, 0, size, size).data;
        return Array.from({ length: size * size }, (_, index) => pixels[index * 4 + 3] > 127 && pixels[index * 4] + pixels[index * 4 + 1] + pixels[index * 4 + 2] < 300);
      };
      const expected = mask(svg, inset), actual = mask(raster, 0);
      const union = expected.filter((ink, index) => ink || actual[index]).length;
      const intersection = expected.filter((ink, index) => ink && actual[index]).length;
      scores.push({ file, agreement: intersection / union });
    }
    return scores;
  });
  for (const icon of iconAgreement) assert.ok(icon.agreement > .85, `${icon.file} depicts the same two cards as the served SVG: ${icon.agreement}`);
  return cards;
}

async function inspectLanding(browser, { origin, root, identity, width, proof, variant }) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, javaScriptEnabled: false, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const response = await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    const cards = await identityAndIcons(page, context, origin, identity, root);
    const expected = ['#top', '#top', '#top', '/docs', '/docs', '/docs', '/docs/install', '/run', '/run', source, source, source, ...(identity.showFooterCredit ? [credit] : [])];
    const hrefs = await page.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    assert.deepEqual(hrefs.sort(), expected.sort(), 'Every landing link belongs to the complete permitted inventory');
    const powered = page.locator('.footer-credit');
    assert.equal(await powered.count(), identity.showFooterCredit ? 1 : 0);
    if (identity.showFooterCredit) assert.match(await powered.innerText(), /Powered by Slate\s*·\s*runeditrun\.com/);
    for (const id of sections) {
      const section = page.locator(`main section#${id}`);
      assert.equal(await section.count(), 1, `${id} section is present exactly once`);
      await section.scrollIntoViewIfNeeded();
      assert.ok(await section.isVisible(), `${id} remains visible`);
      assert.equal(await section.locator('h2').count(), 1);
      if (semantics[id]) assert.match(await section.innerText(), semantics[id], id);
      if (!['included', 'start'].includes(id)) {
        const drawing = section.locator('[role="img"][aria-label]');
        assert.equal(await drawing.count(), 1, `${id} has its illustrated description`);
        assert.ok((await drawing.getAttribute('aria-label')).length > 20);
        assert.ok(await drawing.locator('svg').count() > 0, `${id} has real same-origin vector art`);
      }
    }
    assert.deepEqual(await page.locator('main section').evaluateAll(items => items.map(item => item.id)), sections, 'Only the default core wiki capability sections appear, in reading order');
    const included = page.locator('#included li');
    assert.equal(await included.count(), 6);
    for (const title of ['Comments', 'Templates', 'Verification', 'Inbox', 'Containers', 'Backup and restore']) {
      const item = included.filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      assert.equal(await item.count(), 1);
      assert.ok(await item.locator('svg').count() > 0);
      assert.ok((await item.locator('p').innerText()).length > 10);
    }
    const text = await page.locator('main').innerText();
    assert.doesNotMatch(text, /AI answers|AI assistant|inquiries|connected services|automation runs|trial credits/i, 'No flagship-only capability is advertised');
    await page.evaluate(() => scrollTo(0, 0));
    await mkdir(proof, { recursive: true });
    await page.screenshot({ path: path.join(proof, `product-${variant}-${width}.png`), fullPage: true });

    // Follow both real calls to action; inspect commands on the emitted Run page, without executing an installer.
    for (const id of ['top', 'start']) {
      await page.locator(`#${id}`).getByRole('link', { name: 'Run Slate', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/run');
      const commands = await page.locator('.code pre').allTextContents();
      assert.equal(commands.length, 2);
      assert.match(commands[0], /^curl -fsSL https:\/\/runeditrun\.com\/install\.sh \| sh$/);
      assert.equal(commands[1].trim(), 'rer dev just-every/run-slate');
      assert.match(await page.locator('main').innerText(), /cd run-slate && rer dev/);
      assert.equal(await page.getByRole('link', { name: 'github.com/just-every/run-slate', exact: true }).getAttribute('href'), source);
      await page.goto(origin);
    }
    const docs = [page.locator('header').getByRole('link', { name: 'Docs', exact: true }), page.locator('footer').getByRole('link', { name: 'Docs', exact: true }), page.getByRole('link', { name: 'Read the guide', exact: true }), page.getByRole('link', { name: 'Read the setup guide', exact: true })];
    for (const [index, link] of docs.entries()) {
      const target = index === 3 ? '/docs/install' : '/docs';
      assert.equal(await link.getAttribute('href'), target);
      // The phone header hides a duplicate Docs link; its footer destination stays operable.
      if (await link.isVisible()) await link.click();
      else await page.goto(new URL(target, origin).href);
      assert.equal(new URL(page.url()).pathname, target);
      assert.equal(await page.locator('h1').count(), 1);
      assert.ok((await page.locator('main').innerText()).length > 100);
      if (index === 3) assert.match(await page.locator('main').innerText(), /rer dev/);
      await page.goto(origin);
    }
    const outbound = [];
    const selector = `a[href="${source}"], a[href="${credit}"]`;
    const targets = await page.locator(selector).evaluateAll(links => links.map(link => link.getAttribute('href')));
    for (const [index, target] of targets.entries()) {
      const external = await context.newPage();
      try {
        await external.goto(origin);
        const link = external.locator(selector).nth(index);
        if (!await link.isVisible()) continue;
        // Observe the real navigation attempt and stop at the provider edge; availability of GitHub is not product behavior.
        let complete;
        const intercepted = new Promise(resolve => { complete = resolve; });
        await external.route(url => url.protocol === 'https:', async route => {
          assert.equal(route.request().isNavigationRequest(), true);
          outbound.push(route.request().url());
          await route.abort();
          complete();
        });
        await link.click({ noWaitAfter: true });
        await Promise.race([intercepted, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Outbound navigation was not intercepted')), 30000); timer.unref(); })]);
        assert.equal(outbound.at(-1), new URL(target).href, 'The source or credit action navigates to its declared public destination');
      } finally { await external.close(); }
    }
    // The contract page remains a public site route even though it is excluded from landing navigation.
    const contract = await context.request.get(origin + '/contract');
    assert.equal(contract.status(), 200);
    assert.match(await contract.text(), /HOME-002/);
    console.log(`PROBE HOME-002 acceptance 1–6: built ${variant} at ${width} -> configured lockups, icons, all ten sections, six included capabilities, two Run actions, four docs actions, full link inventory and credit=${identity.showFooterCredit}`);
    return { variant, identity, cards, hrefs, sections, outbound };
  } finally { await context.close(); }
}

/** Default plus independently built buyer edits, all reached through the public site build and HTTP doors. */
export async function landingProduct(browser, { root, site, origin, width, proof, build, serve }) {
  const observations = [await inspectLanding(browser, { root, origin, width, proof, identity: ownerIdentity, variant: 'default' })];
  assert.equal(ownerIdentity.showFooterCredit, true, 'The shipped buyer configuration enables the credit by default');
  const scratch = await mkdtemp(path.join(tmpdir(), 'slate-landing-'));
  try {
    // Isolate buyer edits from the checkout and the other journeys sharing the CI shard.
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    for (const file of files) {
      const destination = path.join(scratch, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(root, file), destination);
    }
    await symlink(path.join(root, 'node_modules'), path.join(scratch, 'node_modules'), 'dir');
    const identity = { name: 'synthetic-slate-1', description: 'An owner-configured knowledge home.', showFooterCredit: true };
    for (const enabled of [true, false]) {
      identity.showFooterCredit = enabled;
      await writeFile(path.join(scratch, 'src/ext/config.ts'), `export const ownerIdentity = ${JSON.stringify(identity)};\n`);
      await build(scratch);
      const hosted = await serve(path.join(scratch, 'dist', 'site'));
      try { observations.push(await inspectLanding(browser, { root: scratch, origin: hosted.origin, width, proof, identity: { ...identity }, variant: enabled ? 'configured-credit' : 'configured-no-credit' })); }
      finally { await new Promise(resolve => hosted.server.close(resolve)); }
    }
    assert.equal(new Set(observations.map(item => JSON.stringify(item.cards))).size, 1, 'Buyer text edits retain the shared card mark');
    await writeFile(path.join(proof, `product-${width}.json`), JSON.stringify(observations, null, 2));
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
