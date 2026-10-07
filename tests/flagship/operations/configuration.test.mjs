import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { inspectOperations } from '../../../scripts/operations.mjs';
import { validateConfiguration } from '../../../scripts/operations-config.mjs';
const root = resolve(import.meta.dirname, '../../..');
const valid = {SLATE_DEPLOY_ENV:'test', SLATE_APP_URL:'https://example.invalid', SLATE_SETUP_OWNER_EMAIL:'owner@example.invalid', SLATE_MAIL_FROM:'slate@example.invalid', SLATE_SESSION_SECRET:'test-only-secret', SLATE_MAIL_API_KEY:'test-only-key'};

test('explicit host cannot hide invalid application URL and inspection never reveals values', async () => {
  for (const value of ['private-invalid-url', 'ftp://private.invalid', '/private/path']) {
    const env = {...valid, SLATE_APP_URL:value, SLATE_PUBLIC_PAGE_HOST:'example.invalid'};
    assert.throws(() => validateConfiguration(env), /APP_URL/);
    const result = await inspectOperations(root, env);
    assert.equal(result.ok, false);
    assert.equal(result.configuration, 'invalid');
    assert.ok(!JSON.stringify(result).includes(value));
  }
});
test('public page host syntax matches runtime hostname and optional port boundary', async () => {
  for (const host of ['not a host', 'https://private.invalid', 'private.invalid/path', 'private.invalid:123456', 'private.invalid:abc']) {
    assert.throws(() => validateConfiguration({...valid, SLATE_PUBLIC_PAGE_HOST:host}), /PUBLIC_PAGE_HOST/);
    const result = await inspectOperations(root, {...valid, SLATE_PUBLIC_PAGE_HOST:host});
    assert.equal(result.ok, false);
    assert.equal(result.configuration, 'invalid');
    assert.ok(!JSON.stringify(result).includes(host));
  }
  for (const host of [undefined, '', '  ', 'example.invalid', 'localhost:8787', 'EXAMPLE.invalid:443']) {
    assert.doesNotThrow(() => validateConfiguration({...valid, SLATE_PUBLIC_PAGE_HOST:host}));
    assert.equal((await inspectOperations(root, {...valid, SLATE_PUBLIC_PAGE_HOST:host})).ok, true);
  }
});
test('deployment check does not promote the local Codex bridge to a hosted provider', async () => {
  for (const provider of ['local-codex', 'unknown-provider']) {
    const result = await inspectOperations(root, {...valid, SLATE_AI_PROVIDER:provider});
    assert.equal(result.ok, false);
    assert.equal(result.configuration, 'invalid');
  }
  assert.equal((await inspectOperations(root, {...valid, SLATE_AI_PROVIDER:'openai'})).ok, true);
});
