import assert from 'node:assert/strict';
import {randomBytes, createHmac, randomUUID} from 'node:crypto';
import {readFile, writeFile, mkdir, mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {command, launch, stop, delay} from '../qualification/local/process.mjs';
import {qualificationPorts} from '../qualification/local/ports.mjs';
import {materializeArtifact} from './materialize-artifact.mjs';
import {sourceIdentity} from '../../scripts/release/source-identity.mjs';

const root = process.cwd();
const source = await sourceIdentity(root);
const ports = qualificationPorts(Number(process.env.DELIVERY_APP_PORT), Number(process.env.DELIVERY_INSPECTOR_PORT), process.env.DELIVERY_PORT_RANGE);
const evidence = resolve(process.env.DELIVERY_EVIDENCE ?? '.artifacts/delivery-runtime');
await mkdir(evidence, {recursive: true});
const directory = await mkdtemp(resolve(evidence, 'run-'));
const {bundle, config, artifactSha256} = await materializeArtifact(root, directory);
const configPath = resolve(directory, 'wrangler.json'), persist = resolve(directory, 'state');
const cli = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const origin = `http://127.0.0.1:${ports.appPort}`;
const sessionSecret = randomUUID(), token = randomBytes(32).toString('base64url');
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
  proc = launch(process.execPath, [cli, 'dev', '--local', '--config', configPath, '--persist-to', persist, '--ip', '127.0.0.1', '--port', String(ports.appPort), '--inspector-port', String(ports.inspectorPort)], {cwd: directory});
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
  const digest = createHmac('sha256', sessionSecret).update(token).digest('hex');
  const sql = `INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('delivery-workspace','Delivery test','', '${now}','${now}','delivery-revision'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('delivery-owner','delivery-workspace','delivery-owner@test.invalid','Delivery owner','DO','owner','member','active',1,'${now}','${now}'); INSERT INTO magic_links(id,email,token_digest,expires_at,created_at) VALUES('delivery-magic','delivery-owner@test.invalid','${digest}','${expiry}','${now}');`;
  await writeFile(resolve(directory, 'identity-fixture.sql'), sql);
  await run(['d1', 'execute', 'DB', '--file', resolve(directory, 'identity-fixture.sql'), '--json'], 'identity-fixture.log');
  await start({APP_URL: origin, PUBLIC_PAGE_HOST: `127.0.0.1:${ports.appPort}`, SETUP_OWNER_EMAIL: 'delivery-owner@test.invalid', SESSION_SECRET: sessionSecret, MAIL_FROM: 'delivery@test.invalid', MAIL_API_KEY: 'TEST-ONLY-NOT-A-PROVIDER-CREDENTIAL', LOCAL_SAMPLE_DATA: 'false', SLATE_PROFILE: 'core-wiki', AI_ENABLED: 'false', SSO_ENABLED: 'false', LINK_PREVIEWS_ENABLED: 'false'}, 200);
  assert.equal((await request('/api/session')).status, 401);
  assert.equal((await request('/api/auth/local-sign-in', 'POST', {next: '/app'})).status, 404);
  const signIn = await request('/api/auth/magic/accept?token=' + token);
  assert.equal(signIn.status, 302); const cookie = signIn.headers.get('set-cookie')?.split(';')[0]; assert(cookie);
  assert.equal((await request('/api/session', 'GET', undefined, cookie)).status, 200);
  checks.push('native session consumes identity fixture; anonymous and local-sample access refused');
  const firstDocument = await request('/app', 'GET', undefined, cookie);
  assert.equal(firstDocument.status, 200);
  const firstHtml = await firstDocument.text();
  assert.match(firstHtml, /data-testid="member-name">Delivery owner</);
  assert.match(firstHtml, /Name this workspace/);

  const initialized = await request('/api/workspace/first-run', 'POST', {operationKey: randomUUID(), workspaceName: 'Delivery workspace', containerName: 'Delivery container', pageTitle: 'Delivery first page'}, cookie);
  assert.equal(initialized.status, 200, await initialized.clone().text());
  const {value: {pageId}} = await initialized.json(); assert(pageId);
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
  assert.doesNotMatch(returningHtml, /Name this workspace/);
  checks.push('authenticated first-use and returning documents render current native state');

  const asset = bundle.assets.find(row => row.path.endsWith('.js')); assert(asset);
  const assetResponse = await request(asset.path); assert.equal(assetResponse.status, 200);
  assert.deepEqual(Buffer.from(await assetResponse.arrayBuffer()), Buffer.from(asset.contentBase64, 'base64'));
  assert.equal((await request('/.assetsignore')).status, 404);
  assert.equal((await request('/assets/missing-delivery-asset.js')).status, 404);
  checks.push('packaged client asset bytes served exactly; internal and missing assets not served');
  assert.deepEqual(await sourceIdentity(root), source, 'Source changed during packaged artifact verification');
  await writeFile(resolve(directory, 'result.json'), JSON.stringify({passed: true, artifactSha256, source, checks, limits: 'Local unpacked delivery artifact only. Identity fixture replaces mailbox possession; no provider delivery, empty-store owner bootstrap, browser UI, prior upgrade or hosted acceptance.'}, null, 2));
  console.log(JSON.stringify({passed: true, artifactSha256, directory, checks}, null, 2));
} catch (error) {
  await writeFile(resolve(directory, 'failure.txt'), String(error.stack).replaceAll(sessionSecret, '<test-session-secret>'));
  throw error;
} finally {await close();}
