// Real local D1/R2 -> Base's portability service and archive file operations.
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { createPortability, PortabilityError } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive, fileRecords } from '@runeditrun/rer/modules/portability/files';
import { installationPolicy } from '../../src/core/features/portability/installation.ts';
import { ApiProblem } from '../../src/core/app/problems.ts';
import { exportFiles } from './portability-files.mjs';
import { RestoreRefusal, configuredOwner, restoreOwner, activateOwner } from './restore-owner.mjs';
import { bootstrapReplacement } from './restore-bootstrap.mjs';
import { normaliseImported, dropRemovedMemberAccess } from './restore-normalise.mjs';
import { installationMigrations } from './portability-migrations.mjs';
const [direction, path, journalPath] = process.argv.slice(2);
const root = process.cwd(), require = createRequire(join(root, 'package.json'));
// Symbolic codes stay in the message so a report can be matched; the sentence says what happened.
const damaged = ['archive_json', 'archive_format', 'content_checksum', 'archive_checksum', 'part_checksum', 'binary_checksum', 'part_order', 'part_count', 'closing_missing', 'data_after_closing', 'row_order', 'rows_missing', 'archive_incomplete'];
function plainReason(code) {
  if (!/^[a-zA-Z_]+(?::[a-zA-Z0-9_]+)*$/.test(code ?? '') && !/^schema_mismatch:migration_data:\d+_[a-zA-Z0-9_]+\.sql$/.test(code ?? '')) return 'Local archive transfer refused or failed. Preserve the archive and inspect the private log.';
  if (direction === 'import' && damaged.includes(code)) return `Restore refused (${code}): the archive is damaged or was changed after export. Nothing was restored; use an intact copy.`;
  if (direction === 'import') return `Restore failed (${code}): nothing was restored. Preserve the archive and inspect the private log.`;
  return code;
}
let proxy;
try {
  // Validate the complete input, and who will own the restore, before opening resource bindings.
  let owner;
  if (direction === 'import') {
    for (const file of [path, journalPath].filter(Boolean)) for await (const record of fileRecords(file)) {}
    owner = await restoreOwner(path, await configuredOwner(root));
  }
  proxy = await require('wrangler').getPlatformProxy({ configPath: resolve('wrangler.jsonc'), persist: { path: resolve('.wrangler/state/v3') }, remoteBindings: false });
  // Import checks the entire physical bucket is empty; export scopes only the
  // native product's retained originals, without moving derived/deleted bytes.
  const files = direction === 'export' ? await exportFiles(proxy.env.DB, proxy.env.FILES) : proxy.env.FILES;
  const policy = await installationPolicy(proxy.env.DB);
  const target = direction === 'import' ? await bootstrapReplacement(proxy.env.DB, policy, owner.email) : { db: proxy.env.DB, policy };
  const service = await createPortability({ ...target, buckets: { FILES: files },
    migrations: () => installationMigrations(root, target, require('wrangler').unstable_splitSqlQuery) });
  const transient = ['queue delivery attempts', 'collaboration presence and runtime caches', 'derived ZIP exports and deleted or unreferenced FILES objects'];
  // Base owns temporary archive files and job cleanup, including failed imports.
  // Its importer carries the validated later archive's journal into finalization.
  const receipt = direction === 'export' ? await exportArchive(service, path, transient) : await importArchive(service, path, transient, journalPath);
  let warnings = [];
  if (direction === 'import') {
    await normaliseImported(proxy.env.DB, policy, receipt.tables.map(table => table.name));
    warnings = await dropRemovedMemberAccess(proxy.env.DB, receipt.tables.map(table => table.name));
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
  console.log(JSON.stringify({ ok: true, ...receipt, ...(warnings.length ? { warnings } : {}) }));
} catch (error) {
  // Symbolic diagnostics only: database and archive values can be private.
  const exitCode = error instanceof RestoreRefusal || ((error instanceof PortabilityError || error instanceof ApiProblem) && error.status === 409) ? 4 : direction === 'import' && (error instanceof PortabilityError || error.message === 'archive_json') ? 2 : 1;
  const reason = error instanceof RestoreRefusal ? error.message : plainReason(error.code ?? error.message);
  const errorType = /^[A-Za-z_]+$/.test(error.name ?? '') ? error.name : 'Error';
  const locations = String(error.stack ?? '').split('\n').slice(1).filter(line => /^\s+at /.test(line)).slice(0, 8);
  console.log(JSON.stringify({ ok: false, reason, exitCode, errorType, locations })); process.exitCode = exitCode;
} finally {
  await proxy?.dispose();
}
