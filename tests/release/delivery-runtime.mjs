import {launchMailRuntime} from '../e2e/mail-runtime.mjs';
import {testDevKey} from '../e2e/dev-key.mjs';
import {signInWithOutbox} from '../e2e/outbox-auth.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile, mkdir, mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {command, launch, stop, delay} from '../qualification/local/process.mjs';
import {qualificationPorts} from '../qualification/local/ports.mjs';
import {materializeArtifact} from './materialize-artifact.mjs';
import {sourceIdentity} from '../../scripts/build/source-identity.mjs';

const root = process.cwd();
const source = await sourceIdentity(root);
const ports = qualificationPorts(Number(process.env.DELIVERY_APP_PORT ?? 8700), Number(process.env.DELIVERY_INSPECTOR_PORT ?? 8701), process.env.DELIVERY_PORT_RANGE);
const evidence = resolve(process.env.DELIVERY_EVIDENCE ?? '.artifacts/delivery-runtime');
await mkdir(evidence, {recursive: true});
const directory = await mkdtemp(resolve(evidence, 'run-'));
const {bundle, config, artifactSha256} = await materializeArtifact(root, directory);
const configPath = resolve(directory, 'wrangler.json'), persist = resolve(directory, 'state');
const cli = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const origin = `http://127.0.0.1:${ports.appPort}`;
const sessionSecret = randomUUID();
let proc, generation = 0; const checks = [];
const run = (args, name) => command(process.execPath, [cli, ...args, '--local', '--config', configPath, '--persist-to', persist], {cwd: directory, log: resolve(directory, name)});
async function close() {
  if (!proc) return; await stop(proc);
  await writeFile(resolve(directory, `worker-${generation}.log`), proc.output().replaceAll(sessionSecret, '<test-session-secret>'));
  await writeFile(resolve(directory, `worker-${generation}-process.json`), JSON.stringify({pid: proc.child.pid, result: await proc.ended, closed: true})); proc = undefined;
}
async function start(variables, expectedStatus) {
  await writeFile(configPath, JSON.stringify({...config, vars: variables}), {mode: 0o600});
  generation++;
  proc = await launchMailRuntime({root,configPath,persist,port:ports.appPort,variables});
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) throw Error(proc.output());
    try {const response = await fetch(origin + '/health', {signal: AbortSignal.timeout(1000)}); if (response.status === expectedStatus) return; } catch {}
    await delay(200);
  }
  throw Error('Packaged Worker readiness timed out: ' + proc.output());
}
const request = (path, method = 'GET', body, cookie) => fetch(origin + path, {method, redirect: 'manual', headers: {...(cookie ? {cookie} : {}), ...(body ? {'content-type': 'application/json', origin} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
try {
  await writeFile(configPath, JSON.stringify(config));
  await run(['d1', 'migrations', 'apply', 'DB'], 'migrations.log');
  await start({}, 503);
  for (const path of ['/health', '/signin', '/app', '/api/session']) assert.equal((await request(path)).status, 503, path);
  checks.push('unconfigured native Worker refuses all tested request families');
  await close();
  // Identity fixture replaces mailbox possession only. No provider request,
  // source application sample, fake API, prefilled page or emitted-code patch.
  const now = new Date().toISOString(), expiry = new Date(Date.now() + 3600000).toISOString();
  const sql = `INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('delivery-workspace','Delivery test','', '${now}','${now}','delivery-revision'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('delivery-owner','delivery-workspace','delivery-owner@test.invalid','Delivery owner','DO','owner','member','active',1,'${now}','${now}');`;
  await writeFile(resolve(directory, 'identity-fixture.sql'), sql);
  await run(['d1', 'execute', 'DB', '--file', resolve(directory, 'identity-fixture.sql'), '--json'], 'identity-fixture.log');
  await start({APP_URL: origin, PUBLIC_PAGE_HOST: `127.0.0.1:${ports.appPort}`, SETUP_OWNER_EMAIL: 'delivery-owner@test.invalid', SESSION_SECRET: sessionSecret, RER_DEV_KEY: testDevKey, MAIL_PROVIDER: 'development', MAIL_FROM: 'delivery@test.invalid', MAIL_API_KEY: 'TEST-ONLY-NOT-A-PROVIDER-CREDENTIAL', LOCAL_DEVELOPMENT: 'true', SLATE_PROFILE: 'core-wiki', AI_ENABLED: 'false', SSO_ENABLED: 'false', LINK_PREVIEWS_ENABLED: 'false'}, 200);
  assert.equal((await request('/api/session')).status, 401);
  const {cookie}=await signInWithOutbox(origin,'delivery-owner@test.invalid');
  assert.equal((await request('/api/auth/local-sign-in', 'POST', {next: '/app'}, cookie)).status, 404);
  assert.equal((await request('/api/session', 'GET', undefined, cookie)).status, 200);
  checks.push('native mail-edge session accepts existing identity; anonymous and retired endpoint access refused');
  const firstDocument = await request('/app', 'GET', undefined, cookie);
  assert.equal(firstDocument.status, 307);
  assert.equal(firstDocument.headers.get('location'), '/setup');
  const setupDocument = await request('/setup', 'GET', undefined, cookie);
  assert.equal(setupDocument.status, 200);
  const firstHtml = await setupDocument.text();
  assert.match(firstHtml, /data-testid="member-email"[^>]*>[\s\S]*delivery-owner@test\.invalid</);
  const setupState = await request('/api/workspace/first-run', 'GET', undefined, cookie);
  assert.equal(setupState.status, 200);
  assert.deepEqual(await setupState.json(), {required: true, canComplete: true});

  const firstRun = {operationKey: randomUUID(), workspaceName: 'Delivery workspace', containerName: 'Delivery container', pageTitle: 'Delivery first page'};
  assert.equal((await request('/api/workspace/first-run', 'POST', firstRun)).status, 401);
  const initialized = await request('/api/workspace/first-run', 'POST', firstRun, cookie);
  assert.equal(initialized.status, 200, await initialized.clone().text());
  const {value: {pageId}} = await initialized.json(); assert(pageId);
  const completedState = await request('/api/workspace/first-run', 'GET', undefined, cookie);
  assert.equal(completedState.status, 200);
  assert.deepEqual(await completedState.json(), {required: false, canComplete: false});
  const completedSetup = await request('/setup', 'GET', undefined, cookie);
  assert.equal(completedSetup.status, 307);
  assert.equal(completedSetup.headers.get('location'), '/app');
  checks.push('unfinished owner redirects to native setup; authenticated completion closes setup and anonymous mutation is refused');
  assert.deepEqual(await (await request('/api/profile', 'GET', undefined, cookie)).json(), {profile: 'core-wiki'});
  const denied = await request('/api/runs', 'GET', undefined, cookie); assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'FEATURE_DISABLED');
  const current = await (await request('/api/pages/' + pageId, 'GET', undefined, cookie)).json();
  const title = 'Delivery ' + randomUUID();
  const edit = await request('/api/pages/' + pageId, 'PATCH', {operationKey: randomUUID(), expectedRevisionId: current.page.revisionId, properties: {title}}, cookie);
  assert.equal(edit.status, 200, await edit.clone().text());
  const search = await request('/api/search?q=' + encodeURIComponent(title), 'GET', undefined, cookie); assert.equal(search.status, 200); assert((await search.json()).items.some(row => row.id === pageId));
  const exported = await request('/api/exports/readable', 'POST', {scope: 'page', id: pageId, format: 'markdown'}, cookie);
  assert.equal(exported.status, 200); assert.equal(exported.headers.get('content-type'), 'application/zip'); assert((await exported.arrayBuffer()).byteLength > 0);
  checks.push('native first-run, page edit, search and readable export succeed; flagship API denied');
  const returningDocument = await request('/app', 'GET', undefined, cookie);
  assert.equal(returningDocument.status, 200);
  const returningHtml = await returningDocument.text();
  assert.match(returningHtml, /data-testid="workspace-name">Delivery workspace</);
  checks.push('authenticated first-use and returning documents render current native state');

  const asset = bundle.assets.find(row => row.path.endsWith('.js')); assert(asset);
  const assetResponse = await request(asset.path); assert.equal(assetResponse.status, 200);
  assert.deepEqual(Buffer.from(await assetResponse.arrayBuffer()), await readFile(resolve(root, 'delivery-artifact', asset.payload)));
  assert.equal((await request('/.assetsignore')).status, 404);
  assert.equal((await request('/assets/missing-delivery-asset.js')).status, 404);
  checks.push('packaged client asset bytes served exactly; internal and missing assets not served');
  assert.deepEqual(await sourceIdentity(root), source, 'Source changed during packaged artifact verification');
  await writeFile(resolve(directory, 'result.json'), JSON.stringify({passed: true, artifactSha256, source, checks, limits: 'Local unpacked delivery artifact only. Identity records are test fixtures; native sign-in with a fake paid mail edge; no provider delivery, empty-store owner bootstrap, browser UI, prior upgrade or hosted acceptance.'}, null, 2));
  console.log(JSON.stringify({passed: true, artifactSha256, directory, checks}, null, 2));
} catch (error) {
  await writeFile(resolve(directory, 'failure.txt'), String(error.stack).replaceAll(sessionSecret, '<test-session-secret>'));
  throw error;
} finally {await close();}
