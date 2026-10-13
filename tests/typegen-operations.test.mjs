import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { describeOperations, inspectOperations } from '@runeditrun/rer/operations';
import { validateConfiguration } from '../scripts/operations-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('operations declares available commands and sources for every required input', async () => {
  const descriptor = await describeOperations(root);
  assert.equal(descriptor.version, 2);
  for (const name of descriptor.requiredEnvironment) assert.ok(descriptor.environmentSources[name]);
  assert.ok(descriptor.requiredEnvironment.includes('SLATE_MAIL_PROVIDER'));
  assert.ok(descriptor.loops.some(loop => loop.type === 'worker' && loop.required && loop.enabled));
  assert.ok(descriptor.loops.every(loop => loop.type !== 'mail'));
  const empty = await inspectOperations(root, {});
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.missingEnvironment, descriptor.requiredEnvironment);
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const command of Object.values(descriptor.commands)) {
    if (command.argv[0] === 'pnpm' && command.argv[1] === 'run') assert.ok(pkg.scripts[command.argv[2]]);
  }
});

test('local deployment validation names missing mail provider and selected key', () => {
  assert.throws(() => validateConfiguration({}), error => error.message.includes('SLATE_MAIL_PROVIDER') && error.message.includes('SLATE_MAIL_API_KEY'));
  const configured = {
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-account-token',
    SLATE_SETUP_OWNER_EMAIL: 'owner@example.test', SLATE_MAIL_PROVIDER: 'resend',
    SLATE_MAIL_FROM: 'slate@example.test', SLATE_SESSION_SECRET: 'test-only-session-material-with-32-bytes',
    SLATE_MAIL_API_KEY: 'test-only-provider-material',
  };
  assert.doesNotThrow(() => validateConfiguration(configured));
  assert.throws(() => validateConfiguration({ ...configured, SLATE_MAIL_PROVIDER: 'development' }), /SLATE_MAIL_PROVIDER/);
  assert.throws(() => validateConfiguration({ ...configured, SLATE_MAIL_API_KEY: '' }), /SLATE_MAIL_API_KEY/);
});

test('operation checker rejects missing scripts for pnpm run and pnpm shorthand', async () => {
  const { checkOperationCommands } = await import('../scripts/check-operation-commands.mjs');
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-command-check-'));
  try {
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.mjs' } }));
    const descriptor = argv => ({ commands: { check: { argv } } });
    assert.equal(checkOperationCommands(directory, descriptor(['pnpm', 'run', 'verify'])), true);
    assert.equal(checkOperationCommands(directory, descriptor(['pnpm', 'verify'])), true);
    assert.throws(() => checkOperationCommands(directory, descriptor(['pnpm', 'run', 'absent'])), /Missing package command/);
    assert.throws(() => checkOperationCommands(directory, descriptor(['pnpm', 'absent'])), /Missing package command/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
