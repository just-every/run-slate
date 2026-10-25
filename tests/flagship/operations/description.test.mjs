import {checkOperationCommands} from '../../../scripts/check-operation-commands.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { describeOperations, inspectOperations, validateEnvironmentSources } from '@runeditrun/rer/operations';
import { readProjectOperations } from '@runeditrun/rer/internal/operations/project-operations.mjs';
const root = resolve(import.meta.dirname, '../../..');
const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-account-token', SLATE_SETUP_OWNER_EMAIL:'owner@example.invalid', SLATE_MAIL_PROVIDER: 'resend', SLATE_MAIL_FROM:'slate@example.invalid', SLATE_SESSION_SECRET:'test-only-not-a-provider-credential', SLATE_MAIL_API_KEY:'test-only-not-a-provider-credential' };
test('describe needs no provider input, check truthfully rejects absent input and validates only local names', async () => {
  const descriptor = await describeOperations(root);
  const absent = await inspectOperations(root, {});
  assert.equal(absent.ok, false);
  assert.deepEqual(absent.missingEnvironment, descriptor.requiredEnvironment);
  const local = await inspectOperations(root, env);
  assert.equal(local.ok, true);
  assert.equal(local.scope, 'local-inputs-only');
  assert.ok(local.unchecked.includes('provider credentials and delivery'));
  assert.ok(!JSON.stringify(local).includes(env.SLATE_SESSION_SECRET));
});
test('declared commands cannot escape checkout and missing package scripts fail description', async () => {
  const dir=await mkdtemp(join(tmpdir(),'slate-operations-'));
  const descriptor={version:2,project:'test/project',runtime:{requirements:[]},requiredEnvironment:[],commands:{verify:{argv:['pnpm','run','verify'],inputs:['package.json'],effects:'local'}}};
  try {
    await writeFile(join(dir,'package.json'),JSON.stringify({scripts:{}}));
    assert.throws(()=>checkOperationCommands(dir,descriptor),/Missing package command/);
    descriptor.commands.verify.argv=['node','check.mjs'];
    descriptor.commands.verify.inputs=['../outside'];
    await assert.rejects(readProjectOperations(dir,descriptor,validateEnvironmentSources),/Invalid project input/);
    await symlink('/etc/hosts',join(dir,'outside'));
    descriptor.commands.verify.inputs=['outside'];
    await assert.rejects(readProjectOperations(dir,descriptor,validateEnvironmentSources),/escapes checkout/);
    descriptor.commands.verify.inputs=['absent.mjs'];
    assert.equal((await readProjectOperations(dir,descriptor,validateEnvironmentSources)).commands[0].available,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
