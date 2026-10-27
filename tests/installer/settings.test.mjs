import manifest from '../../rer-setup.json' with {type: 'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInstallerModel, readSetupManifestBytes } from '@runeditrun/rer/setup-manifest';
import { prepareSettings } from '@runeditrun/rer/adapter-settings';
import { withoutLocalVariables } from '@runeditrun/rer/local/build';
import { localOperation } from '@runeditrun/rer/local/operation';
import { settingsFor, loadLocalSettings } from '../../scripts/installer/settings.mjs';
import { fixture } from './helpers.mjs';

const store = { step: async () => {}, addSecrets: () => {} };
test("private local settings retain custody across loads, build failures and unsafe origins", async (t) => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: 'explicit settings path is read and preserved, with no secret generated per load', run: async t => {
  const { root } = await fixture(t); await mkdir(join(root, 'private'));
  const env = { SLATE_LOCAL_SETTINGS_PATH: join(root, 'private/local.vars') };
  const developerInput = { SLATE_PROFILE: 'flagship', AI_ENABLED: 'true', AI_PROVIDER: 'local-codex', ALLOW_LOOPBACK_DELEGATION: 'true', SSO_ENABLED: 'true' };
  const schema = await readFile(new URL(import.meta.resolve('@runeditrun/rer/setup-schema')));
  const localManifest = readSetupManifestBytes(Buffer.from(JSON.stringify(manifest)), schema);
  const model = createInstallerModel(localManifest);
  for (const [name, value] of Object.entries(developerInput)) {
    assert.equal(model.fieldVisible(name, developerInput), true, `${name} remains available in local setup`);
    assert.equal(model.fieldDefinition(name, developerInput).valid(value), true);
  }
  const context = { root, manifest: localManifest, input: { SETUP_OWNER_EMAIL: 'owner@example.test', ...developerInput }, store };
  await prepareSettings(context, { secrets: settingsFor(env) });
  const first = await readFile(env.SLATE_LOCAL_SETTINGS_PATH);
  for (const [name, value] of Object.entries(developerInput)) assert.equal(context.vars[name], value);
  assert.deepEqual(await loadLocalSettings(root, env), context.vars);
  assert.deepEqual(await loadLocalSettings(root, env), context.vars);
  assert.deepEqual(await readFile(env.SLATE_LOCAL_SETTINGS_PATH), first);
} },
    { name: 'local build hides exact private settings, honors operation lock and restores them after failure', run: async t => {
  const { root } = await fixture(t);
  const context = { root, manifest, input: { SETUP_OWNER_EMAIL: 'owner@example.test' }, store };
  await prepareSettings(context, { secrets: settingsFor({}) });
  const file = join(root, '.dev.vars'), before = await readFile(file), original = await stat(file);
  const lock = await localOperation(root);
  let builtWhileBusy = false;
  // This fixture is a separate checkout, not the CLI verify operation's child.
  // Explicit standalone custody prevents inheriting another root's token.
  try {
    await assert.rejects(withoutLocalVariables(root, () => { builtWhileBusy = true; }, { nested: null }));
    assert.equal(builtWhileBusy, false, 'a competing build never runs');
    assert.deepEqual(await readFile(file), before, 'busy refusal leaves private settings untouched');
  }
  finally { await lock.release(); }
  await assert.rejects(withoutLocalVariables(root, async () => {
    await assert.rejects(readFile(file), { code: 'ENOENT' }); throw Error('build failed');
  }, { nested: null }), /build failed/);
  assert.deepEqual(await readFile(file), before); assert.equal((await stat(file)).ino, original.ino);
} },
    { name: 'unsafe settings never start local development', run: async t => {
  const { root } = await fixture(t);
  await writeFile(join(root, '.dev.vars'), 'APP_URL=https://hosted.example.test\nLOCAL_DEVELOPMENT=true\n');
  await assert.rejects(loadLocalSettings(root));
} },
    { name: 'a saved ephemeral port is rejected before development can choose another origin', run: async t => {
  const { root } = await fixture(t, `throw Error('dev must not spawn');`);
  const context = { root, manifest, input: { SETUP_OWNER_EMAIL: 'owner@example.test' }, store };
  await prepareSettings(context, { secrets: settingsFor({}) });
  const path = join(root, '.dev.vars');
  await writeFile(path, (await readFile(path, 'utf8')).replace(context.vars.APP_URL, 'http://127.0.0.1:0'));
  await assert.rejects(loadLocalSettings(root));

} }
  ];
  for (const scenario of cases) {
    try {  await scenario.run(t); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
});
