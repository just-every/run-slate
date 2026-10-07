import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {readDeploymentInput,renderWranglerConfig} from '../../scripts/deployment.mjs';
test('FLAG-001 — setup emits the core-wiki default and validates explicit opt-in',()=>{
  const input={SLATE_DEPLOY_ENV:'preview',SLATE_APP_URL:'https://slate.test',SLATE_SETUP_OWNER_EMAIL:'owner@test.invalid',SLATE_MAIL_FROM:'slate@test.invalid'};
  assert.throws(()=>readDeploymentInput({...input,SLATE_PROFILE:'core'}),/SLATE_PROFILE/);
  const config=readDeploymentInput(input);
  assert.equal(config.launchProfile,'core-wiki');assert.equal(config.aiEnabled,'false');assert.equal(config.ssoEnabled,'false');
  const template=readFileSync('deploy/wrangler.template.toml','utf8');
  assert.match(renderWranglerConfig(template,config,'test-database'),/SLATE_PROFILE = "core-wiki"/);
  assert.match(renderWranglerConfig(template,readDeploymentInput({...input,SLATE_PROFILE:'flagship'}),'test-database'),/SLATE_PROFILE = "flagship"/);
});
