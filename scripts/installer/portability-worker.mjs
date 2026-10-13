// Real local D1/R2 -> Base's authenticated HTTP handler -> Base's archive CLI.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createPortabilityHandler, readArchive, PortabilityError } from '@runeditrun/rer/modules/portability';
import { main as archiveCLI } from '@runeditrun/rer/modules/portability/cli';
import { installationPolicy } from '../../src/core/features/portability/installation.ts';
import { ApiProblem } from '../../src/core/app/problems.ts';
import { exportFiles } from './portability-files.mjs';
import { RestoreRefusal, configuredOwner, restoreOwner, activateOwner } from './restore-owner.mjs';
import { bootstrapReplacement } from './restore-bootstrap.mjs';
import { normaliseImported, dropRemovedMemberAccess } from './restore-normalise.mjs';
const [direction, path, journalPath] = process.argv.slice(2);
const root = process.cwd(), require = createRequire(join(root, 'package.json'));
// Symbolic codes stay in the message so a report can be matched; the sentence says what happened.
const damaged = ['archive_json', 'archive_format', 'content_checksum', 'archive_checksum', 'part_checksum', 'binary_checksum', 'part_order', 'part_count', 'closing_missing', 'data_after_closing', 'row_order', 'rows_missing', 'archive_incomplete'];
function plainReason(code) {
  if (!/^[a-zA-Z_]+(?::[a-zA-Z0-9_]+)*$/.test(code ?? '')) return 'Local archive transfer refused or failed. Preserve the archive and inspect the private log.';
  if (direction === 'import' && damaged.includes(code)) return `Restore refused (${code}): the archive is damaged or was changed after export. Nothing was restored; use an intact copy.`;
  if (direction === 'import') return `Restore failed (${code}): nothing was restored. Preserve the archive and inspect the private log.`;
  return code;
}
let proxy, server, directory, reason, jobId, handler, policy, origin, cookie, remoteError, owner, warnings = [], complete = false, laterJournal;
try {
  // Validate the complete input, and who will own the restore, before opening resource bindings.
  if (direction === 'import') {
    for await (const record of readArchive(Readable.toWeb((await import('node:fs')).createReadStream(path)))) {}
    if (journalPath) {
      let latest;
      for await (const record of readArchive(Readable.toWeb((await import('node:fs')).createReadStream(journalPath)))) if (record.kind === 'manifest') latest = record;
      laterJournal = {sourceIdentity:latest.sourceIdentity, epoch:latest.epoch, journal:latest.journal};
    }
    owner = await restoreOwner(path, await configuredOwner(root));
  }
  proxy = await require('wrangler').getPlatformProxy({ configPath: resolve('wrangler.jsonc'), persist: { path: resolve('.wrangler/state/v3') }, remoteBindings: false });
  cookie = 'rer_local_transfer=' + randomBytes(32).toString('hex');
  server = createServer(async (incoming, outgoing) => {
    try {
      let request = new Request(new URL(incoming.url, origin), { method: incoming.method, headers: incoming.headers,
        ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}) });
      if (laterJournal && incoming.method === 'POST' && new URL(request.url).pathname.endsWith('/finalize')) {
        const body = await request.json(), headers = new Headers(request.headers);
        headers.delete('Content-Length');
        request = new Request(request.url, {method:'POST', headers, body:JSON.stringify({...body,laterJournal})});
      }
      const response = await handler(request);
      if (response.status === 201) jobId = (await response.clone().json()).id;
      if (!response.ok) {
        const result = await response.clone().json();
        if (/^[a-z_]+(?::[a-zA-Z0-9_]+)*$/.test(result.error ?? '')) remoteError = new PortabilityError(result.error, response.status);
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(outgoing); else outgoing.end();
    } catch (error) {
      remoteError = error;
      if (outgoing.headersSent) outgoing.destroy();
      else { outgoing.writeHead(500, { 'Content-Type': 'application/json' }); outgoing.end('{"error":"transport_failed"}'); }
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  // Import checks the entire physical bucket is empty; export scopes only the
  // native product's retained originals, without moving derived/deleted bytes.
  const files = direction === 'export' ? await exportFiles(proxy.env.DB, proxy.env.FILES) : proxy.env.FILES;
  policy = await installationPolicy(proxy.env.DB);
  const target = direction === 'import' ? await bootstrapReplacement(proxy.env.DB, policy, owner.email) : { db: proxy.env.DB, policy };
  handler = await createPortabilityHandler({ ...target, buckets: { FILES: files }, appOrigin: origin,
    authorize: request => request.headers.get('Cookie') === cookie ? 'local-owner' : null });
  directory = await mkdtemp(resolve('.seed/installer/transfer-'));
  const session = join(directory, 'session'); await writeFile(session, cookie, { mode: 0o600 });
  await archiveCLI([direction, '--origin', origin, '--session-file', session, direction === 'export' ? '--out' : '--from', path]);
  let manifest, closing;
  for await (const record of readArchive(Readable.toWeb((await import('node:fs')).createReadStream(path)))) {
    if (record.kind === 'manifest') manifest = record;
    if (record.kind === 'closing') closing = record;
  }
  if (direction === 'import') {
    await normaliseImported(proxy.env.DB, policy, manifest.tables.map(table => table.name));
    warnings = await dropRemovedMemberAccess(proxy.env.DB, manifest.tables.map(table => table.name));
    if (owner.email.toLowerCase() !== owner.archived.toLowerCase()) await activateOwner(proxy.env.DB, owner.email);
    // Search indexes are derived; authoritative rows and object bytes were restored atomically.
    const { prepareSearchRestoreStatements } = await import('../../src/core/features/search/restore-index.ts');
    const names = ['pages', 'page_revisions', 'page_blocks', 'page_contributors', 'containers', 'knowledge_templates', 'comments', 'comment_threads'];
    const tables = Object.fromEntries(await Promise.all(names.map(async name => [name, (await proxy.env.DB.prepare(`SELECT * FROM "${name}"`).all()).results])));
    await proxy.env.DB.batch([
      proxy.env.DB.prepare("INSERT OR REPLACE INTO search_dirty SELECT CASE WHEN page_kind='record' THEN 'record:' ELSE 'page:' END||id,workspace_id,'restore' FROM pages"),
      ...['containers', 'knowledge_templates', 'comment_threads'].map((table, index) => proxy.env.DB.prepare(`INSERT OR REPLACE INTO search_dirty SELECT '${['container', 'template', 'comment-thread'][index]}:'||id,workspace_id,'restore' FROM ${table}`)),
    ]);
    const statements = prepareSearchRestoreStatements(proxy.env.DB, tables);
    if (statements.length) await proxy.env.DB.batch(statements);
  }
  await rm(path + '.transfer.json', { force: true });
  complete = true;
  console.log(JSON.stringify({ ok: true, contentHash: closing.contentHash, ...(warnings.length ? { warnings } : {}), tables: manifest.tables.map(({name,count}) => ({name,count})), objects: manifest.objects.length,
    exclusions: { tables: manifest.excludedTables, columns: manifest.excludedColumns, configuration: true, transient: ['queue delivery attempts', 'collaboration presence and runtime caches', 'derived ZIP exports and deleted or unreferenced FILES objects'] }, requiredConfiguration: manifest.requiredConfiguration }));
} catch (error) {
  // Symbolic diagnostics only: database and archive values can be private.
  error = remoteError ?? error;
  const exitCode = error instanceof RestoreRefusal || ((error instanceof PortabilityError || error instanceof ApiProblem) && error.status === 409) ? 4 : direction === 'import' && (error instanceof PortabilityError || error.message === 'archive_json') ? 2 : 1;
  reason = error instanceof RestoreRefusal ? error.message : plainReason(error.code ?? error.message);
  const errorType = /^[A-Za-z_]+$/.test(error.name ?? '') ? error.name : 'Error';
  const locations = String(error.stack ?? '').split('\n').slice(1).filter(line => /^\s+at /.test(line)).slice(0, 8);
  console.log(JSON.stringify({ ok: false, reason, exitCode, errorType, locations })); process.exitCode = exitCode;
} finally {
  // The command owns this job; an ephemeral local transport cannot be resumed.
  // Base abort releases snapshots/staging without removing a completed restore.
  if (jobId && handler && (direction === 'export' || !complete)) {
    try {
      const response = await handler(new Request(origin + '/api/portability/' + (direction === 'export' ? 'exports/' : 'imports/') + jobId + '/abort', { method: 'POST', headers: { Cookie: cookie, Origin: origin } }));
      if (!response.ok) throw Error('cleanup');
    } catch { console.log(JSON.stringify({ ok: false, reason: 'transfer_cleanup_failed', exitCode: 1 })); process.exitCode = 1; }
  }
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await proxy?.dispose(); if (directory) await rm(directory, { recursive: true, force: true });
}
