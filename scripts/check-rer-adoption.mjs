import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {requireClean, git} from './release/source-identity.mjs';
import {integrationRecipe} from './release/integration-recipe.mjs';
const {values} = parseArgs({options: {'service-root': {type: 'string'}, output: {type: 'string'}}});
if (!values['service-root'] || !values.output) throw Error('Use --service-root READ_ONLY_CHECKOUT --output NEW_SCRATCH_DIRECTORY');
const root = process.cwd(), service = resolve(values['service-root']), output = resolve(values.output);
if (output === service || output.startsWith(service + '/')) throw Error('Adoption check may not modify the service checkout');
requireClean(root);
const load = name => import(pathToFileURL(resolve(service, name)).href);
const [{exportBundle, checkBundle}, {adoptBundle}, {parseProjectRegistration}, {validateCandidateSpec}, {sha256, validatePlan}] = await Promise.all([
  load('scripts/projects/integration-bundle.mjs'), load('scripts/projects/integrations.mjs'), load('src/projects/descriptor.ts'), load('src/delivery/candidate-plan.ts'), load('src/delivery/contracts.ts'),
]);
await mkdir(output);
await mkdir(resolve(output, 'adopted'));
const revision = git(root, 'rev-parse', 'HEAD');
const project = parseProjectRegistration(JSON.parse(await readFile('rer-project.json', 'utf8')), revision);
await exportBundle({projectRoot: root, repository: project.sourceRepository, revision, output: resolve(output, 'bundle')});
await adoptBundle(resolve(output, 'bundle'), 'slate', resolve(output, 'adopted'));
await checkBundle(resolve(output, 'adopted/slate'));
const {createIntegration} = await import(pathToFileURL(resolve(output, 'adopted/slate/index.mjs')).href);
const integration = createIntegration({sha256, validatePlan});
const spec = await integrationRecipe(root);
await validateCandidateSpec(spec);
for (const environment of ['production', 'preview']) {
  const installationId = `local-adoption-${environment}`;
  const workerName = `rer-${(await sha256(installationId)).slice(0, 16)}-${environment === 'production' ? 'prod' : 'preview'}-slate`;
  const addresses = {kind: 'workers_dev', subdomain: 'adoption-check', createSubdomain: false, app: {workerName: `${workerName}-app`, hostname: `${workerName}-app.adoption-check.workers.dev`, path: '/signin'}};
  // Test-only public configuration. No mail, credentials, owner data or provider
  // requests are used; the actual service validator checks the generated plan.
  const config = {...integration.generatedConfiguration(addresses), SETUP_OWNER_EMAIL: 'source-check@example.test', MAIL_FROM: 'Slate <source-check@example.test>', RER_MANAGEMENT_ORIGIN: 'https://management.example.test', ...(environment === 'preview' ? {controlledProviders: ['test-owned-mail']} : {})};
  const plan = await integration.generatePlan(installationId, environment, config);
  plan.addresses = addresses; integration.validateAddresses(plan); await validatePlan(plan);
  assert.deepEqual(plan.migrations, spec.migrations, 'Plan must retain every original SQL byte and hash');
  assert.equal(plan.publicVariables.SLATE_PROFILE, 'core-wiki');
  assert.equal(plan.publicVariables.AI_ENABLED, 'false');
  assert.equal(plan.publicVariables.SSO_ENABLED, 'false');
  await integration.revisePlan(plan, {publicVariables: {...plan.publicVariables, LINK_PREVIEWS_ENABLED: 'false'}, secretNames: [...plan.secretNames], ...(environment === 'preview' ? {controlledProviders: ['test-owned-mail']} : {})});
  assert.equal(plan.publicVariables.LINK_PREVIEWS_ENABLED, 'false');
  const saved = structuredClone(plan);
  await assert.rejects(integration.revisePlan(plan, {publicVariables: {...plan.publicVariables, SLATE_PROFILE: 'flagship'}, secretNames: [...plan.secretNames]}));
  assert.deepEqual(plan, saved, 'Refusal must leave the accepted plan unchanged');
  if (environment === 'preview') {assert.deepEqual(plan.schedules, []); assert.deepEqual(plan.queueConsumers, []);}
}
const tamper = resolve(output, 'adopted/slate/source-provenance.json');
const original = await readFile(tamper);
await writeFile(tamper, Buffer.concat([original, Buffer.from(' ')]));
await assert.rejects(checkBundle(resolve(output, 'adopted/slate')));
await writeFile(tamper, original); await checkBundle(resolve(output, 'adopted/slate'));
const result = {check: 'source-adoption', passed: true, sourceRevision: revision, serviceRevision: git(service, 'rev-parse', 'HEAD'), bundle: resolve(output, 'bundle'), migrations: spec.migrations.length, limitations: ['scratch adoption only', 'no service registration or provider effects', 'no compiled artifact or runtime proof', 'sealed prior-store upgrade release review pending']};
await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
