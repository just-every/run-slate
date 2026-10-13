import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {deploymentSpec} from '../../scripts/delivery/base/spec.mjs';
import {sha256} from '../../scripts/build/source-identity.mjs';
import config from '../../scripts/delivery/base/packaging.json' with {type: 'json'};
import {integrationRecipe} from '../../scripts/sync-integration.mjs';

test('release spec preserves every applied migration byte and native binding', async () => {
  const spec = await deploymentSpec(process.cwd(), config.artifact.specInputs);
  const names = (await readdir('migrations/core')).filter(name => name.endsWith('.sql')).sort();
  assert.deepEqual(spec.migrations.map(row => row.name), names);
  for (const row of spec.migrations) {
    const bytes = await readFile(`migrations/core/${row.name}`);
    assert.deepEqual(Buffer.from(row.sql), bytes);
    assert.equal(row.sha256, sha256(bytes)); assert.equal(row.binding, 'DB');
  }
  assert.deepEqual(spec.resources.map(row => row.binding), ['DB', 'FILES', 'JOBS']);
  assert.deepEqual(spec.durableObjects, [{binding: 'CONTENT_COLLABORATION', className: 'ContentCollaboration'}]);
  assert.deepEqual(spec.secretNames, ['SESSION_SECRET', 'MAIL_API_KEY']);
  assert.equal(spec.publicVariables.SLATE_PROFILE, 'core-wiki');
  assert.equal(spec.publicVariables.AI_ENABLED, 'false');
  await integrationRecipe(process.cwd());
});

test('operations inspect input readiness without claiming provider readiness', async () => {
  const {inspectOperations, describeOperations} = await import('@runeditrun/rer/operations');
  const descriptor = await describeOperations(process.cwd());
  assert.equal(descriptor.project, 'just-every/slate');
  const missing = await inspectOperations(process.cwd(), {});
  assert.equal(missing.ok, false); assert.deepEqual(missing.missingEnvironment, descriptor.requiredEnvironment);
  const ready = await inspectOperations(process.cwd(), {CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-account-token', SLATE_SETUP_OWNER_EMAIL: 'owner@example.test', SLATE_MAIL_PROVIDER: 'resend', SLATE_MAIL_FROM: 'mail@example.test', SLATE_SESSION_SECRET: 'test-only-session-material-with-32-bytes', SLATE_MAIL_API_KEY: 'test-only-mail-material'});
  assert.equal(ready.ok, true); assert.equal(ready.scope, 'local-inputs-only');
  assert.ok(ready.unchecked.includes('provider credentials and delivery'));
  assert.doesNotMatch(JSON.stringify(ready), /test-only-session-material|test-only-mail-material/);
});
