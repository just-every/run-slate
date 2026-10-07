import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {shellChecks} from '../core/shell.mjs';

let runtime, browser;
const checks = [];
try {
  runtime = await createRuntime({root: process.cwd(), evidence: process.env.QUAL_EVIDENCE, appPort: 59804, inspectorPort: 59805});
  browser = await chromium.launch({headless: true});
  const context = await browser.newContext();
  await fixtureFirstOwner(runtime, context);
  const owner = (await context.cookies()).map(cookie => cookie.name+'='+cookie.value).join('; ');
  const check = async (clauses, name, run) => {
    try {await run(); checks.push({clauses, name, passed: true});}
    catch (error) {checks.push({clauses, name, passed: false, error: error.stack});}
  };
  await shellChecks({r: runtime, owner, check, context});
  await writeFile(runtime.directory+'/result.json', JSON.stringify({checks, artifact: runtime.artifact.artifactHash}, null, 2));
  assert.ok(checks.every(check => check.passed), JSON.stringify(checks, null, 2));
  console.log(JSON.stringify({passed: true, checks, evidence: runtime.directory}, null, 2));
} finally {await browser?.close(); await runtime?.close();}
