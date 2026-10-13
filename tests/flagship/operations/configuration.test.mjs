import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { inspectOperations } from '@runeditrun/rer/operations';
import { validateConfiguration } from '../../../scripts/operations-config.mjs';
const root = resolve(import.meta.dirname, '../../..');
const valid = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-cloudflare-token', SLATE_SETUP_OWNER_EMAIL: 'owner@example.test', SLATE_MAIL_PROVIDER: 'resend', SLATE_MAIL_FROM: 'slate@example.test', SLATE_SESSION_SECRET: 'test-only-session-secret-with-32-bytes', SLATE_MAIL_API_KEY: 'test-only-mail-key' };

test('deployment input inspection rejects invalid account, selected mail provider and native identity without leaking values', async () => {
  for (const extra of [{CLOUDFLARE_ACCOUNT_ID: 'private-invalid-account'}, {SLATE_MAIL_PROVIDER: 'development'}, {SLATE_SETUP_OWNER_EMAIL: 'private-invalid-mailbox'}, {SLATE_MAIL_FROM: 'private-invalid-sender'}, {SLATE_SESSION_SECRET: 'short'}]) {
    assert.throws(() => validateConfiguration({...valid, ...extra}));
    const result = await inspectOperations(root, {...valid, ...extra});
    assert.equal(result.ok, false);
    assert.equal(result.configuration, 'invalid');
    for (const value of Object.values(extra)) assert.ok(!JSON.stringify(result).includes(value));
  }
  for (const provider of ['resend', 'sendgrid']) {
    assert.equal((await inspectOperations(root, {...valid, SLATE_MAIL_PROVIDER: provider})).ok, true);
  }
});
