import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {createHash, createHmac, randomBytes, randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {createServer} from 'node:net';
import {launch, stop} from '../local/process.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {identity} from '../local/identity.mjs';

async function inventory(directory) {
  const files = {};
  async function walk(relative = '') {
    for (const entry of await readdir(path.join(directory, relative), {withFileTypes: true})) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else files[name] = createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex');
    }
  }
  await walk();
  return files;
}
async function free(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
  await new Promise(resolve => server.close(resolve));
}
/** Copy only the authorized stopped synthetic restore. Never opens its SQLite file. */
export async function copiedRuntime({root, evidence, source, appPort, inspectorPort}) {
  await free(appPort); await free(inspectorPort);
  await mkdir(evidence, {recursive: true});
  const original = await inventory(source);
  const directory = await mkdtemp(path.join(evidence, 'runtime-'));
  const persist = path.join(directory, 'state');
  await cp(source, persist, {recursive: true});
  assert.deepEqual(await inventory(persist), original, 'Restore copy byte identity');
  const artifact = await identity(root);
  const server = path.join(root, 'dist/server');
  const emitted = JSON.parse(await readFile(path.join(server, 'wrangler.json'), 'utf8'));
  const origin = `http://127.0.0.1:${appPort}`, sessionSecret = randomUUID();
  const config = {...emitted, main: path.resolve(server, emitted.main), assets: {...emitted.assets, directory: path.resolve(server, emitted.assets.directory)}, no_bundle: true,
    vars: {APP_URL: origin, SETUP_OWNER_EMAIL: 'qualification-owner@test.invalid', SESSION_SECRET: sessionSecret, MAIL_FROM: 'qualification@test.invalid', MAIL_API_KEY: 'TEST-FIXTURE-NOT-A-PROVIDER-CREDENTIAL', LOCAL_SAMPLE_DATA: 'false', AI_ENABLED: 'false', SSO_ENABLED: 'false', LINK_PREVIEWS_ENABLED: 'false'}};
  const configPath = path.join(directory, 'wrangler.json');
  await writeFile(configPath, JSON.stringify(config), {mode: 0o600});
  const sqliteDir = path.join(persist, 'v3/d1/miniflare-D1DatabaseObject');
  const sqliteFiles = (await readdir(sqliteDir)).filter(p => p.endsWith('.sqlite'));
  const databases = sqliteFiles.map(file => new DatabaseSync(path.join(sqliteDir, file)));
  const content = databases.filter(db => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pages'").get());
  assert.equal(content.length, 1, 'Exactly one copied content database');
  const db = content[0];
  for (const candidate of databases) if (candidate !== db) candidate.close();
  const target = db.prepare("SELECT id,title FROM pages WHERE title LIKE '%impact%'").get();
  assert.ok(target, 'Restored original Word fixture');
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO magic_links(id,email,token_digest,expires_at,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), 'qualification-owner@test.invalid', createHmac('sha256', sessionSecret).update(token).digest('hex'), new Date(Date.now()+3600000).toISOString(), new Date().toISOString());
  db.close();
  const proc = launch(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--config', configPath, '--persist-to', persist, '--ip', '127.0.0.1', '--port', String(appPort), '--inspector-port', String(inspectorPort)], {cwd: directory});
  const sanitize = value => String(value).replaceAll(token, '<test-token>').replaceAll(sessionSecret, '<test-session-secret>');
  const close = async () => {
    await stop(proc);
    const ended = await proc.ended;
    await writeFile(path.join(evidence, 'worker.log'), sanitize(proc.output()));
    assert.deepEqual(await inventory(source), original, 'Original restore remained byte identical');
    await writeFile(path.join(evidence, 'fidelity.json'), JSON.stringify({artifact, originalFiles: original, copiedByteIdentical: true, originalUnchanged: true, worker: {pid: proc.child.pid, ...ended}}, null, 2));
    await rm(directory, {recursive: true, force: true});
    await free(appPort); await free(inspectorPort);
  };
  try {
    const deadline = Date.now()+60000;
    while (true) {
      if (proc.child.exitCode !== null || proc.child.signalCode !== null) throw Error(sanitize(proc.output()));
      try {if ((await fetch(origin+'/health', {signal: AbortSignal.timeout(1000)})).status === 200) break;} catch {}
      if (Date.now() >= deadline) throw Error('Worker readiness timeout: '+sanitize(proc.output()));
      await delay(200);
    }
  } catch (error) {await close(); throw error;}
  return {origin, target, token, sanitize, close};
}
