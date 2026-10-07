import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdir, mkdtemp, rm, writeFile, symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {deploymentSpec, readTemplate, sha256} from '../../scripts/release/deployment-spec.mjs';
import {integrationRecipe} from '../../scripts/release/integration-recipe.mjs';
import {files, inside, moduleType, contentType, moduleFiles, assetFiles} from '../../scripts/release/artifact-files.mjs';

test('release spec preserves every applied migration byte and native binding', async () => {
  const spec = await deploymentSpec(process.cwd());
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

test('unsupported template bindings and syntax fail explicitly', () => {
  assert.throws(() => readTemplate('[[services]]\nbinding = "OTHER"'), /Unsupported deployment binding/);
  assert.throws(() => readTemplate('[vars]\nA = "x"\nA = "y"'), /duplicate/);
  assert.throws(() => readTemplate('main = "a" # unsupported inline comment'));
});

test('artifact inventory refuses private files, links and out-of-root modules', async () => {
  await mkdir('.artifacts', {recursive: true});
  const root = await mkdtemp(resolve('.artifacts/release-source-'));
  try {
    await writeFile(resolve(root, 'entry.js'), 'export default {}');
    assert.deepEqual(await files(root), ['entry.js']);
    assert.equal(moduleType('entry.js'), 'esm'); assert.equal(contentType('style.css'), 'text/css');
    assert.throws(() => moduleType('unknown.xyz'), /Unsupported emitted module/);
    await writeFile(resolve(root, '.dev.vars'), 'TEST_ONLY=value');
    await assert.rejects(files(root), /Private configuration/);
    await rm(resolve(root, '.dev.vars'));
    await symlink(resolve(root, 'entry.js'), resolve(root, 'link.js'));
    await assert.rejects(files(root), /link or special/);
    await assert.rejects(inside(root, '../../package.json'), /leaves/);
  } finally {await rm(root, {recursive: true, force: true});}
});

test('operations inspect input readiness without claiming provider readiness', async () => {
  const {inspectOperations, describeOperations} = await import('../../scripts/operations.mjs');
  const descriptor = await describeOperations(process.cwd());
  assert.equal(descriptor.project, 'just-every/slate');
  const missing = await inspectOperations(process.cwd(), {});
  assert.equal(missing.ok, false); assert.equal(missing.missingEnvironment.length, 6);
  const ready = await inspectOperations(process.cwd(), {SLATE_DEPLOY_ENV: 'source-check', SLATE_APP_URL: 'https://source-check.example.test', SLATE_SETUP_OWNER_EMAIL: 'owner@example.test', SLATE_MAIL_FROM: 'mail@example.test', SLATE_SESSION_SECRET: 'test-only-session-material', SLATE_MAIL_API_KEY: 'test-only-mail-material'});
  assert.equal(ready.ok, true); assert.equal(ready.scope, 'local-inputs-only');
  assert.ok(ready.unchecked.includes('provider credentials and delivery'));
  assert.doesNotMatch(JSON.stringify(ready), /test-only-session-material|test-only-mail-material/);
});


test('artifact selection excludes build metadata and obeys emitted asset exclusions', async () => {
  await mkdir('.artifacts', {recursive: true});
  const root = await mkdtemp(resolve('.artifacts/release-selection-'));
  try {
    await mkdir(resolve(root, '.vite'));
    await writeFile(resolve(root, '.vite/manifest.json'), '{}');
    await writeFile(resolve(root, 'wrangler.json'), '{}');
    await writeFile(resolve(root, 'index.js'), 'export default {}');
    await writeFile(resolve(root, 'index.js.map'), '{}');
    assert.deepEqual(await moduleFiles(root), ['index.js']);
    await rm(resolve(root, '.vite'), {recursive: true});
    await rm(resolve(root, 'index.js.map'));
    await writeFile(resolve(root, '.assetsignore'), 'wrangler.json\n.dev.vars\n');
    assert.deepEqual(await assetFiles(root), ['index.js']);
    await writeFile(resolve(root, '.assetsignore'), '**/*.json\n');
    await assert.rejects(assetFiles(root), /Unsupported emitted asset ignore syntax/);
  } finally {await rm(root, {recursive: true, force: true});}
});
