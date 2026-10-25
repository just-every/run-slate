import test from 'node:test';
import assert from 'node:assert/strict';

test('operations inspect input readiness without claiming provider readiness', async () => {
  const {inspectOperations} = await import('@runeditrun/rer/operations');
  const missing = await inspectOperations(process.cwd(), {});
  assert.equal(missing.ok, false);
  const ready = await inspectOperations(process.cwd(), {CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-account-token', SLATE_SETUP_OWNER_EMAIL: 'owner@example.test', SLATE_MAIL_PROVIDER: 'resend', SLATE_MAIL_FROM: 'mail@example.test', SLATE_SESSION_SECRET: 'test-only-session-material-with-32-bytes', SLATE_MAIL_API_KEY: 'test-only-mail-material'});
  assert.equal(ready.ok, true); assert.equal(ready.scope, 'local-inputs-only');
  assert.ok(ready.unchecked.includes('provider credentials and delivery'));
  assert.doesNotMatch(JSON.stringify(ready), /test-only-session-material|test-only-mail-material/);
});
