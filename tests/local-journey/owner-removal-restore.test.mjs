import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { chromium } from '@playwright/test';
import { scratch, resources, repo } from './runtime.mjs';
import { saveFailure } from './diagnostics.mjs';
import { http } from './populated.mjs';
import { signInBrowser } from '../e2e/outbox-auth.mjs';
import { startEmittedWorker, stop as stopWorker } from '../e2e/runtime-harness.mjs';

const cli = (verb, flags = []) => ['node_modules/@runeditrun/rer/bin/rer.mjs', verb, ...flags, '--json', '--non-interactive'];
const original = 'original@example.test', successor = 'successor@example.test';

/**
 * PORT-005 and WORK-007 through the real commands: the setup owner makes a
 * successor owner and removes themselves. Restoring an archive taken after
 * that brings the successor back as the owner and the original owner stays
 * removed. An archive taken before it names two owners, so restore asks who
 * owns the workspace instead of quietly handing it back to the removed one.
 */
test('a restore never brings a removed setup owner back', { timeout: 30 * 60_000 }, async () => {
  const copy = await scratch(); let dev, browser;
  const run = (verb, flags) => copy.run('node', cli(verb, flags));
  const refused = async (verb, flags) => { const child = copy.start('node', cli(verb, flags)); const code = await child.done; await copy.stop(child); return { code, error: child.output.split('\n').filter(line => line.includes('"event":"error"')).map(line => JSON.parse(line)).at(-1) }; };
  const sql = async command => JSON.parse(await copy.run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '.wrangler/state', '--config', 'wrangler.jsonc', '--command', command, '--json']))[0].results;
  const owners = () => sql(`SELECT email,status,role,is_setup_owner FROM members WHERE email IN ('${original}','${successor}') ORDER BY email`);
  const start = async () => {
    await resources();
    const vars = parseEnv(await readFile(join(copy.root, '.dev.vars'), 'utf8'));
    dev = (await startEmittedWorker(join(copy.root, '.wrangler/state'), vars, Number(new URL(vars.APP_URL).port))).child;
    return http(vars.APP_URL, parseEnv(await readFile(join(copy.root, '.rer/local/dev-key.env'), 'utf8')).RER_DEV_KEY);
  };
  const stopDev = async () => { await stopWorker(dev); dev = undefined; };
  const evidence = join(repo, '.artifacts/local-journey'); await mkdir(evidence, { recursive: true });
  try {
    await copy.run('rer', ['install']);
    await run('setup', ['--owner-email', original]);
    let api = await start();
    const first = await api.signIn(original);
    await api.ok(first.cookie, 'POST', '/api/workspace/first-run', { operationKey: crypto.randomUUID(), workspaceName: 'Handover', containerName: 'Handbook', pageTitle: 'Welcome' });
    const next = await api.invite(first.cookie, { email: successor });
    await api.ok(first.cookie, 'PUT', `/api/members/${next.member.id}/role`, { operationKey: crypto.randomUUID(), expectedRole: 'member', role: 'owner' });
    await stopDev();
    await mkdir(join(copy.root, 'exports'), { recursive: true });
    await run('export', ['--output', 'exports/before-removal.rer']);
    api = await start();
    // A fresh sign-in is the email confirmation an owner's removal asks for.
    const leaving = await api.signIn(original);
    await api.ok(leaving.cookie, 'POST', '/api/members/remove', { operationKey: crypto.randomUUID(), memberId: (await api.ok(leaving.cookie, 'GET', '/api/session')).member.id });
    await stopDev();
    await run('export', ['--output', 'exports/after-removal.rer']);

    // The documented route: import into an empty checkout, then set it up for the archive's owner.
    await run('reset', ['--yes']);
    await run('import', ['--input', 'exports/after-removal.rer', '--yes']);
    await run('setup', ['--owner-email', successor]);
    assert.deepEqual(await owners(), [
      { email: original, status: 'removed', role: 'owner', is_setup_owner: 0 },
      { email: successor, status: 'active', role: 'owner', is_setup_owner: 1 },
    ], 'the successor owns the restored workspace and the removed owner stays removed');
    api = await start();
    const mail = await api.outbox();
    assert.equal((await api.call(null, 'POST', '/api/auth/magic', { email: original, requestKey: crypto.randomUUID() })).status, 200);
    assert.deepEqual(await api.outbox(), mail, 'the removed owner gets no sign-in mail');
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const page = await context.newPage();
        await signInBrowser(page, api.origin, successor);
        const session = await page.evaluate(async () => (await (await fetch('/api/session')).json()).member);
        assert.deepEqual([session.email, session.role], [successor, 'owner'], 'the successor signs in to the restored workspace as its owner');
        await page.screenshot({ path: join(evidence, `owner-removal-restore-${width}.png`), fullPage: true });
      } finally { await context.close(); }
    }
    await stopDev();

    // An archive from before the removal names both owners: the default route asks for a choice.
    await run('reset', ['--yes']);
    const ambiguous = await refused('import', ['--input', 'exports/before-removal.rer', '--yes']);
    assert.notEqual(ambiguous.code, 0, 'an archive with two owners is not restored by default');
    assert.match(ambiguous.error.message, /^Restore refused: the archive was taken while 2 people owned the workspace.*rer setup --owner-email.*Nothing was restored/);
    assert.deepEqual(await sql('SELECT (SELECT COUNT(*) FROM workspaces) AS workspaces,(SELECT COUNT(*) FROM members) AS members'), [{ workspaces: 0, members: 0 }], 'the installation stays empty');
    await run('setup', ['--owner-email', successor]);
    await run('import', ['--input', 'exports/before-removal.rer', '--yes']);
    assert.deepEqual(await owners(), [
      { email: original, status: 'historical', role: 'owner', is_setup_owner: 0 },
      { email: successor, status: 'active', role: 'owner', is_setup_owner: 1 },
    ], 'the chosen owner is the one active member');
  } catch (error) { try { await saveFailure(copy, dev, 'owner-removal-restore', error); } finally { throw error; } }
  finally { try { await browser?.close(); await stopWorker(dev); } finally { await copy.close(); } }
});
