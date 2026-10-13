import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdir, rm, stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { scratch, waitFor, resources } from './runtime.mjs';
import { saveFailure } from './diagnostics.mjs';
import { readmeCommands, assertDistExcludesSecrets } from './readme.mjs';
import { signIn, useDevKey } from './browser.mjs';
import { assertOneOwner } from './owner.mjs';
import { repo } from './runtime.mjs';
import { sentinels, publicStatuses, setupStatuses } from './security.mjs';
const devKeyOf = async root => parseEnv((await readFile(join(root, '.rer/local/dev-key.env'))).toString()).RER_DEV_KEY;

test('fresh README CLI setup, native sign-in at both widths, custody, transfer and reset', { timeout: 40 * 60_000 }, async () => {
  const copy = await scratch(); let browser, dev;
  const email = 'you@example.test', cli = (verb, flags = []) => ['node_modules/@runeditrun/rer/bin/rer.mjs', verb, ...flags, '--json', '--non-interactive'];
  const run = (verb, flags) => copy.run('node', cli(verb, flags));
  try {
    const fences = await readmeCommands(copy.root);
    // In a terminal `rer dev` stays in the foreground; this harness has no terminal, so it asks for that explicitly.
    const devCommand = `${fences[1][2]} --foreground`;
    const source = join(copy.directory, 'source');
    await copy.run('git', ['clone', '--quiet', '--bare', copy.root, source]); await rm(copy.root, { recursive: true });
    const config = join(copy.directory, 'gitconfig');
    await writeFile(config, `[url "${source}"]\n\tinsteadOf = https://github.com/just-every/run-slate.git\n`, { mode: 0o600 });
    await copy.run('/bin/sh', ['-c', fences[0].join('\n')], copy.directory, { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' });
    await copy.run('/bin/sh', ['-c', fences[1][0]]);
    await run('check', ['--profile', 'first-party']);
    const setup = copy.start('/bin/sh', ['-c', fences[1][1]]);
    try { await setupStatuses(copy, setup); assert.equal(await setup.done, 0, 'initial setup completes'); } finally { await copy.stop(setup); }
    const file = join(copy.root, '.dev.vars'), bytes = await readFile(file), vars = parseEnv(bytes.toString());
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await assert.rejects(fetch(vars.APP_URL + '/health'), 'setup leaves no app running');
    await run('setup'); assert.ok((await readFile(file)).equals(bytes));
    const devKey = await devKeyOf(copy.root), keyed = { headers: { 'x-rer-dev-key': devKey } }; useDevKey(devKey);
    await assertDistExcludesSecrets(copy.root, [vars.SESSION_SECRET]);
    await sentinels(copy.root);
    await resources(); dev = copy.start('/bin/sh', ['-c', devCommand]);
    await waitFor(() => { if (dev.exitCode !== null) throw Error('CLI dev failed; private output withheld'); return dev.output.includes('RER_READY ' + vars.APP_URL); }, 'CLI ready');
    // Each dev start opens signed in through dev identity; restarts send no sign-in mail.
    for (let restart = 1; restart <= 3; restart++) {
      await run('dev', ['--stop']); await copy.stop(dev);
      await resources(); dev = copy.start('/bin/sh', ['-c', devCommand]);
      await waitFor(() => { if (dev.exitCode !== null) throw Error(`CLI dev restart ${restart} failed; private output withheld`); return dev.output.includes('RER_OPEN ' + vars.APP_URL + '/__dev/key#rer-dev='); }, `dev restart ${restart} signed-in open`);
    }
    await publicStatuses(vars.APP_URL, copy.root, 'dev');
    browser = await chromium.launch({ headless: true });
    // Dev identity: RER_OPEN signs the browser in as the claimed owner with a real
    // key-gated dev session; the badge switches to real local personas.
    const open = [...dev.output.matchAll(/RER_OPEN (\S+)/g)].at(-1)[1];
    for (const route of ['/__dev/personas', '/auth/dev/enter?as=editor']) assert.equal((await fetch(vars.APP_URL + route, { redirect: 'manual' })).status, 404, 'dev identity needs the key');
    assert.deepEqual((await (await fetch(vars.APP_URL + '/__dev/personas', keyed)).json()).map(persona => persona.as), ['owner', 'editor', 'guest', 'signed-out']);
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const page = await context.newPage(), session = () => page.evaluate(async () => { const r = await fetch('/api/session'); return { status: r.status, body: await r.json() }; });
        await page.goto(open); await page.waitForURL(vars.APP_URL + '/setup');
        assert.deepEqual((await session()).body.member.email, email);
        await page.getByText('Dev: ' + email).waitFor();
        await page.screenshot({ path: join(repo, '.artifacts/local-journey', `dev-owner-${width}.png`), fullPage: true });
        for (const [as, persona] of [['editor', 'editor@dev.localhost'], ['guest', 'guest@dev.localhost']]) {
          await page.goto(vars.APP_URL + '/auth/dev/enter?as=' + as); await page.waitForURL(url => url.pathname.startsWith('/app'));
          const current = await session(); assert.equal(current.status, 200); assert.equal(current.body.member.email, persona); assert.equal(current.body.member.role, 'member');
          await page.screenshot({ path: join(repo, '.artifacts/local-journey', `dev-${as}-${width}.png`), fullPage: true });
        }
        // Signed out lands on the Lobby, whose policy lets no page script fetch; the browser's own cookies are checked instead.
        await page.goto(vars.APP_URL + '/auth/dev/enter?as=signed-out'); assert.equal((await context.request.get(vars.APP_URL + '/api/session')).status(), 401);
      } finally { await context.close(); }
    }
    const rejectedOrigin = await fetch(vars.APP_URL + '/api/auth/magic', { method: 'POST', headers: { Origin: 'https://other.example.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email }) });
    assert.equal(rejectedOrigin.status, 403, 'HTML transport retains the native origin guard');
    const screenshots = join(repo, '.artifacts/local-journey'); await mkdir(screenshots, { recursive: true });
    for (const width of [1440, 390]) {
      await run('outbox', ['--owner-email', email]);
      const listing = await fetch(vars.APP_URL + '/__dev/outbox', keyed);
      const message = (await listing.text()).match(/href="(\/__dev\/outbox\?message=[^"]+)"/)[1];
      await signIn(browser, new URL(message, vars.APP_URL).href, email, width, async page => {
        await page.waitForURL(vars.APP_URL + '/setup');
        await page.goto(vars.APP_URL + '/app/search');
        await page.waitForURL(vars.APP_URL + '/setup');
        await page.getByLabel('Workspace name', { exact: true }).waitFor();
        await page.screenshot({ path: join(screenshots, `cli-setup-${width}.png`), fullPage: true });
      });
    }
    let owner, agent, createdPageId, createdFileId;
    for (const width of [1440, 390]) {
      await run('outbox', ['--owner-email', email]);
      const page = await browser.newPage({ viewport: { width, height: 900 }, javaScriptEnabled: false });
      await page.goto(vars.APP_URL + '/signin');
      await page.getByLabel('Email address', { exact: true }).fill(email);
      await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Email me a sign-in link', exact: true }).click()]);
      assert.equal((await page.context().request.post(vars.APP_URL + '/__dev/key', { data: { key: devKey } })).status(), 204);
      await page.goto(vars.APP_URL + '/__dev/outbox');
      const message = await page.getByRole('link', { name: 'Read message', exact: true }).first().getAttribute('href');
      await page.close();
      const current = await signIn(browser, new URL(message, vars.APP_URL).href, email, width, async page => {
        if (width === 1440) {
          await page.getByLabel('Workspace name', { exact: true }).fill('CLI owner workspace');
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          await page.getByLabel('Space name', { exact: true }).fill('Owner documents');
          await page.getByLabel('First page title', { exact: true }).fill('Retained CLI page');
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          await page.getByRole('button', { name: 'Skip this step', exact: true }).click();
          await page.waitForURL(vars.APP_URL + '/app/pages/*');
          createdPageId = new URL(page.url()).pathname.split('/').at(-1);
          createdFileId = await page.evaluate(async pageId => {
          const form = new FormData(); form.set('operationKey', 'case:002'); form.set('pageId', pageId); form.set('file', new File(['retained attachment bytes'], 'owner.txt', { type: 'text/plain' }));
          const upload = await fetch('/api/media', { method: 'POST', body: form }); if (!upload.ok) throw Error('native file creation failed');
          return (await upload.json()).value.id;
          }, createdPageId);
          assert.ok(createdPageId && createdFileId);
        }
        await page.goto(vars.APP_URL + '/setup');
        await page.waitForURL(vars.APP_URL + '/app');
        await page.goto(vars.APP_URL + '/app/pages/' + createdPageId);
        await page.getByRole('textbox', { name: 'Page title', exact: true }).waitFor();
        assert.equal(await page.getByRole('textbox', { name: 'Page title', exact: true }).inputValue(), 'Retained CLI page');
        await page.screenshot({ path: join(screenshots, `cli-core-${width}.png`), fullPage: true });
      });
      if (owner) assert.equal(current.id, owner.id); owner = current;
    }
    await run('dev'); // A compatible second invocation reuses the registered instance.
    const refusal = copy.start('node', cli('reset', ['--yes'])); assert.equal(await refusal.done, 4); await copy.stop(refusal);
    await copy.run('/bin/sh', ['-c', fences[2][0]]);
    await copy.run('/bin/sh', ['-c', fences[2][1]]); await copy.stop(dev); dev = undefined;
    // Default README browsing above remains core-wiki. This separate native
    // flagship session adds a real credential whose capability must not move.
    await resources(); dev = copy.start('node', cli('dev'), copy.root, { SLATE_PROFILE: 'flagship' });
    await waitFor(() => { if (dev.exitCode !== null) throw Error('CLI server failed; private output withheld'); return dev.output.includes('"event":"ready"'); }, 'flagship ready');
    await run('outbox', ['--owner-email', email]);
    const listing = await fetch(vars.APP_URL + '/__dev/outbox', keyed);
    const messagePath = (await listing.text()).match(/href="(\/__dev\/outbox\?message=[^"]+)"/)[1];
    await signIn(browser, new URL(messagePath, vars.APP_URL).href, email, 1440, async (page, member) => {
      agent = await page.evaluate(async input => {
        const response = await fetch('/api/agent/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        if (!response.ok) throw Error('Native credential issuance failed'); return response.json();
      }, { operationKey: 'case:003', subjectId: member.id, scope: { tools: ['read_evidence'], sourceIds: [createdPageId], audience: [member.id], grantIds: [] }, expiresAt: '2099-01-01T00:00:00.000Z' });
      assert.ok(agent.token, 'native credential issued');
    });
    await run('dev', ['--stop']); await copy.stop(dev); dev = undefined;
    await assertOneOwner(copy.run);
    const before = await copy.run('git', ['status', '--porcelain', '--untracked-files=no']); assert.equal(before, '');
    await mkdir(join(copy.root, 'exports'), { recursive: true }); await run('export', ['--output', 'exports/installation.rer']);
    const archive = await readFile(join(copy.root, 'exports/installation.rer'));
    assert.equal(archive.includes(Buffer.from(vars.SESSION_SECRET)), false);
    assert.equal(archive.includes(Buffer.from(agent.token)), false, 'archive omits agent capability');
    assert.equal(archive.includes(Buffer.from(createHash('sha256').update(JSON.stringify(agent.token)).digest('hex'))), false, 'archive omits native credential digest');
    assert.equal((await stat(join(copy.root, 'exports/installation.rer'))).mode & 0o777, 0o600);
    assert.equal((await stat(join(copy.root, 'exports/installation.rer'))).nlink, 1, 'export leaves one link, so the same file imports');
    const unconfirmed = copy.start('node', cli('reset')); assert.equal(await unconfirmed.done, 4); await copy.stop(unconfirmed);
    await mkdir(join(copy.root, '.rer/deploy'), { recursive: true }); await writeFile(join(copy.root, '.rer/deploy/receipt'), 'retained');
    await run('reset', ['--yes']); await access(join(copy.root, 'exports/installation.rer')); await access(join(copy.root, '.rer/deploy/receipt'));
    // The documented recovery flow imports the very file export wrote, then exports the same content again.
    await run('import', ['--input', 'exports/installation.rer', '--yes']); await run('export', ['--output', 'exports/again.rer']);
    const sealed = content => JSON.parse(content.toString().trim().split('\n').at(-1)).contentHash;
    assert.equal(sealed(await readFile(join(copy.root, 'exports/again.rer'))), sealed(archive));
    await run('reset', ['--yes']);
    // Restore into a distinct fresh clone with its own frozen dependencies.
    const target = join(copy.directory, 'restored');
    await copy.run('git', ['clone', '--quiet', source, target]);
    await copy.run('rer', ['install'], target);
    await mkdir(join(target, 'exports'));
    await writeFile(join(target, 'exports/input.rer'), archive, { mode: 0o600 });
    const restore = (verb, flags = []) => copy.run('node', cli(verb, flags), target);
    const lines = archive.toString().trim().split('\n'), damaged = JSON.parse(lines.at(-1));
    damaged.contentHash = (damaged.contentHash[0] === '0' ? '1' : '0') + damaged.contentHash.slice(1); lines[lines.length - 1] = JSON.stringify(damaged);
    await writeFile(join(target, 'exports/damaged.rer'), lines.join('\n') + '\n', { mode: 0o600 });
    const corruption = copy.start('node', cli('import', ['--input', 'exports/damaged.rer', '--yes']), target);
    assert.equal(await corruption.done, 2); await copy.stop(corruption);
    await restore('import', ['--input', 'exports/input.rer', '--yes']);
    const occupied = copy.start('node', cli('import', ['--input', 'exports/input.rer', '--yes']), target);
    assert.equal(await occupied.done, 4); await copy.stop(occupied);
    const retained = await copy.run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'wrangler.jsonc', '--command', 'SELECT title FROM pages', '--json'], target);
    assert.deepEqual(JSON.parse(retained)[0].results.map(row => row.title), ['Retained CLI page']);
    const metadata = await copy.run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'wrangler.jsonc', '--command', "SELECT id,token_hash,scope_json,revoked_at FROM intelligence_agent_credentials", '--json'], target);
    const credentials = JSON.parse(metadata)[0].results;
    assert.equal(credentials.length, 1); assert.equal(credentials[0].id, agent.value.id);
    assert.equal(credentials[0].token_hash, 'erased:' + agent.value.id); assert.equal(credentials[0].scope_json, '{}'); assert.ok(credentials[0].revoked_at);
    await restore('export', ['--output', 'exports/restored.rer']);
    const closing = content => JSON.parse(content.toString().trim().split('\n').at(-1)).contentHash;
    assert.equal(closing(await readFile(join(target, 'exports/restored.rer'))), closing(archive));
    await restore('setup', ['--owner-email', email]);
    await assertOneOwner((command, args) => copy.run(command, args, target));
    const targetOrigin = parseEnv((await readFile(join(target, '.dev.vars'))).toString()).APP_URL, targetKey = await devKeyOf(target); useDevKey(targetKey);
    await resources(); dev = copy.start('node', cli('dev'), target, { SLATE_PROFILE: 'flagship' });
    await waitFor(() => { if (dev.exitCode !== null) throw Error('CLI server failed; private output withheld'); return dev.output.includes('"event":"ready"'); }, 'restored ready');
    assert.equal((await fetch(targetOrigin + '/api/agent/tools', { headers: { Authorization: 'Bearer ' + agent.token } })).status, 401, 'former agent capability cannot authenticate after restore');
    for (const width of [1440, 390]) {
      await restore('outbox', ['--owner-email', email]);
      const listing = await fetch(targetOrigin + '/__dev/outbox', { headers: { 'x-rer-dev-key': targetKey } });
      const message = (await listing.text()).match(/href="(\/__dev\/outbox\?message=[^"]+)"/)[1];
      await signIn(browser, new URL(message, targetOrigin).href, email, width, async page => {
        await page.goto(targetOrigin + '/app/pages/' + createdPageId);
        const title = page.getByRole('textbox', { name: 'Page title', exact: true }); await title.waitFor(); assert.equal(await title.inputValue(), 'Retained CLI page');
        const restored = await page.evaluate(async fileId => {
          const search = await (await fetch('/api/search?query=Retained')).json();
          const response = await fetch('/api/media/' + fileId);
          return { search: search.items.map(item => item.pageId), bytes: await response.text(), status: response.status };
        }, createdFileId);
        assert.ok(restored.search.includes(createdPageId)); assert.equal(restored.status, 200); assert.equal(restored.bytes, 'retained attachment bytes');
        await page.screenshot({ path: join(screenshots, `cli-restored-${width}.png`), fullPage: true });
      });
    }
    await restore('dev', ['--stop']); await copy.stop(dev); dev = undefined;
    assert.equal(await copy.run('git', ['status', '--porcelain', '--untracked-files=no'], target), '');
    await run('setup', ['--owner-email', email]); await assertOneOwner(copy.run);
    await run('build');
    await resources(); dev = copy.start('node', cli('preview')); await waitFor(() => { if (dev.exitCode !== null) throw Error('CLI server failed; private output withheld'); return dev.output.includes('"event":"ready"'); }, 'preview ready');
    await publicStatuses(vars.APP_URL, copy.root, 'preview');
    const reuse = await run('preview'); assert.ok(JSON.parse(reuse.trim().split('\n').at(-1)).reused);
    await run('preview', ['--stop']); await copy.stop(dev); dev = undefined;
    await run('reset', ['--yes']); await run('setup', ['--owner-email', email]);
    const inventory = await copy.run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'wrangler.jsonc', '--command', 'SELECT count(*) AS pages FROM pages', '--json']);
    assert.equal(JSON.parse(inventory)[0].results[0].pages, 0);
    assert.equal(await copy.run('git', ['status', '--porcelain', '--untracked-files=no']), '');
    console.log('CLI journeys: setup twice, three dev restarts opening signed in, dev owner/editor/guest/signed-out personas at 1440/390, native sign-in/POST and first-run route at 1440/390, dev reuse/stop, transfer round trip, reset custody, build then preview reuse/stop, empty reset/setup.');
  } catch (error) { try { await saveFailure(copy, dev, 'cli', error); } finally { throw error; } }
  finally { try { await copy.stop(dev); } finally { try { await browser?.close(); } finally { await copy.close(); } } }
});
