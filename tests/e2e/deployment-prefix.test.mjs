import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentNames, readDeploymentInput, renderWranglerConfig} from '../../scripts/deployment.mjs';
import {readFile} from 'node:fs/promises';
test('explicit resource prefix preserves default names and validates all cloud names', async () => {
  assert.equal(deploymentNames('preview').worker, 'slate-preview');
  const names = deploymentNames('seedproof', 'rer-seedproof-slate');
  for (const name of [names.worker, names.database, names.files, names.jobs]) assert.ok(name.startsWith('rer-seedproof-slate-'));
  for (const prefix of ['', '../secret', 'UPPER', '-wrong', 'x'.repeat(27)]) assert.throws(() => deploymentNames('preview', prefix), /SLATE_RESOURCE_PREFIX/);
  const input = readDeploymentInput({SLATE_DEPLOY_ENV: 'seedproof', SLATE_RESOURCE_PREFIX: 'rer-seedproof-slate', SLATE_APP_URL: 'https://example.test', SLATE_SETUP_OWNER_EMAIL: 'owner@example.test', SLATE_MAIL_FROM: 'mail@example.test', SLATE_MAIL_PROVIDER: 'sendgrid'});
  assert.equal(input.mailProvider, 'sendgrid');
  const config = renderWranglerConfig(await readFile('deploy/wrangler.template.toml', 'utf8'), input, 'test-id');
  assert.match(config, /MAIL_PROVIDER = "sendgrid"/);
  assert.match(config, /name = "rer-seedproof-slate-seedproof"/);
});
