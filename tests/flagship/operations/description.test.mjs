import {checkOperationCommands} from '../../../scripts/check-operation-commands.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { describeOperations, inspectOperations, validateEnvironmentSources } from '@runeditrun/rer/operations';
import { readProjectOperations } from '@runeditrun/rer/internal/operations/project-operations.mjs';
const root = resolve(import.meta.dirname, '../../..');
const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-account-token', SLATE_SETUP_OWNER_EMAIL:'owner@example.invalid', SLATE_MAIL_PROVIDER: 'resend', SLATE_MAIL_FROM:'slate@example.invalid', SLATE_SESSION_SECRET:'test-only-not-a-provider-credential', SLATE_MAIL_API_KEY:'test-only-not-a-provider-credential' };
test('describe needs no provider input, check truthfully rejects absent input and validates only local names', async () => {
  const descriptor = await describeOperations(root);
  assert.equal(descriptor.version, 2);
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
test('manifest maps every contract clause and policy exactly once, release changes resolve', async () => {
  const contract=await readFile(join(root,'CONTRACT.md'),'utf8');
  const seed=JSON.parse(await readFile(join(root,'seed.json'),'utf8'));
  const release=JSON.parse(await readFile(join(root,'RELEASE.json'),'utf8'));
  const ids=[...contract.matchAll(/^- \*\*([A-Z]+-\d{3}) —/gm)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  const mapped=seed.capabilities.flatMap(x=>x.clauses);
  assert.deepEqual([...mapped].sort(),[...ids].sort());
  const policies=[...contract.matchAll(/\*Policy: `([^`]+)`/g)].map(m=>m[1]);
  assert.equal(new Set(policies).size,policies.length);
  assert.deepEqual([...seed.extensionPoints.policies].sort(),[...policies].sort());
  for(const id of Object.keys(release.contractChanges)) assert.ok(id.startsWith('BASE-')||ids.includes(id),id);
  for(const id of ['WORK-002','WORK-004','WORK-005','SAVE-007'])assert.ok(!ids.includes(id));
  assert.ok(!ids.some(id=>/^(BRIEF|DECI|PLAN|MILE|TASK|RISK|EVID)-/.test(id)));
});
