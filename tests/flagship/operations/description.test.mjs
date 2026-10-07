import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { describeOperations, inspectOperations } from '../../../scripts/operations.mjs';
import { readProjectOperations } from '../../../scripts/project-operations.mjs';
const root = resolve(import.meta.dirname, '../../..');
const env = { SLATE_DEPLOY_ENV:'acceptance-local', SLATE_APP_URL:'https://example.invalid', SLATE_SETUP_OWNER_EMAIL:'owner@example.invalid', SLATE_MAIL_FROM:'slate@example.invalid', SLATE_SESSION_SECRET:'test-only-not-a-provider-credential', SLATE_MAIL_API_KEY:'test-only-not-a-provider-credential' };
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
test('conditional AI and identity inputs fail closed without exposing values', async () => {
  for (const extra of [{SLATE_AI_ENABLED:'true'}, {SLATE_SSO_ENABLED:'true'}, {SLATE_APP_URL:'credential-must-not-leak'}]) {
    const result = await inspectOperations(root, {...env,...extra});
    assert.equal(result.ok, false);
    assert.equal(result.configuration, 'invalid');
    assert.ok(!JSON.stringify(result).includes('credential-must-not-leak'));
  }
});
test('declared commands cannot escape checkout and missing package scripts fail description', async () => {
  const dir=await mkdtemp(join(tmpdir(),'slate-operations-'));
  const descriptor={version:2,project:'test/project',runtime:{requirements:[]},requiredEnvironment:[],commands:{verify:{argv:['pnpm','run','verify'],inputs:['package.json'],effects:'local'}}};
  try {
    await writeFile(join(dir,'package.json'),JSON.stringify({scripts:{}}));
    await assert.rejects(readProjectOperations(dir,descriptor),/Missing package command/);
    descriptor.commands.verify.argv=['node','check.mjs'];
    descriptor.commands.verify.inputs=['../outside'];
    await assert.rejects(readProjectOperations(dir,descriptor),/Invalid project input/);
    await symlink('/etc/hosts',join(dir,'outside'));
    descriptor.commands.verify.inputs=['outside'];
    await assert.rejects(readProjectOperations(dir,descriptor),/escapes checkout/);
    descriptor.commands.verify.inputs=['absent.mjs'];
    assert.equal((await readProjectOperations(dir,descriptor)).commands[0].available,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('manifest maps every contract clause exactly once, release changes resolve, policies stay eight', async () => {
  const contract=await readFile(join(root,'CONTRACT.md'),'utf8');
  const seed=JSON.parse(await readFile(join(root,'seed.json'),'utf8'));
  const release=JSON.parse(await readFile(join(root,'RELEASE.json'),'utf8'));
  const ids=[...contract.matchAll(/^- \*\*([A-Z]+-\d{3}) —/gm)].map(m=>m[1]);
  assert.equal(ids.length,220); assert.equal(new Set(ids).size,220);
  const mapped=seed.capabilities.flatMap(x=>x.clauses);
  assert.deepEqual([...mapped].sort(),[...ids].sort());
  assert.equal(seed.extensionPoints.policies.length,8);
  for(const id of Object.keys(release.contractChanges)) assert.ok(id.startsWith('BASE-')||ids.includes(id),id);
  for(const id of ['WORK-002','WORK-004','WORK-005','SAVE-007'])assert.ok(!ids.includes(id));
  assert.ok(!ids.some(id=>/^(BRIEF|DECI|PLAN|MILE|TASK|RISK|EVID)-/.test(id)));
});
