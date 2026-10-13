import {resetDatabase} from '../../e2e/setup/reset-database';
import {applyD1Migrations, env} from 'cloudflare:test';
import {expect} from 'vitest';
import type {FeatureContext} from '../../../src/core/app/feature-context';
import {exportWorkspace, restoreWorkspace} from '../../../src/core/features/portability/service';
import {decodeArchive} from '../../../src/core/features/portability/archive';

/** Inspect canonical rows, including nonportable receipts, before serialization. */
export async function storedText(db: D1Database) {
  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{name: string}>()).results;
  const rows = await db.batch(tables.map(({name}) => db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)));
  return JSON.stringify(rows.map((result, i) => ({table: tables[i]!.name, rows: result.results})));
}

export async function nativeExport(ctx: FeatureContext) {
  const job = await exportWorkspace(ctx);
  expect(job.state).toBe('completed');
  const key = await ctx.db.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(job.id).first<string>('archive_key');
  const bytes = new Uint8Array(await (await ctx.files.get(key!))!.arrayBuffer());
  const {manifest, entries} = await decodeArchive(bytes);
  return {bytes, manifest, text: Object.values(entries).map(value => new TextDecoder().decode(value)).join('\n')};
}

/** A distinct migrated D1 and R2, containing only the new installation's owner. */
export async function freshRestore(source: FeatureContext, bytes: Uint8Array) {
  const bindings = env as unknown as {Q11_RESTORE_DB: D1Database; Q11_RESTORE_FILES: R2Bucket};
  const db = bindings.Q11_RESTORE_DB, files = bindings.Q11_RESTORE_FILES;
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  await resetDatabase(db);
  for (const object of (await files.list()).objects) await files.delete(object.key);
  const workspaceId = crypto.randomUUID(), memberId = crypto.randomUUID();
  // Test-only bootstrap identities; every restored product row comes through restoreWorkspace.
  for (const [table, originalId, replacements] of [
    ['workspaces', source.actor.workspaceId, {id: workspaceId}],
    ['members', source.actor.id, {id: memberId, workspace_id: workspaceId}],
  ] as const) {
    const row = {...(await source.db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(originalId).first<Record<string, string | number | null>>())!, ...replacements};
    const names = Object.keys(row);
    await db.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
  }
  expect(await db.prepare('SELECT count(*) n FROM pages').first<number>('n')).toBe(0);
  expect((await files.list()).objects).toEqual([]);
  const target = {...source, db, files, actor: {...source.actor, id: memberId, workspaceId}};
  expect((await restoreWorkspace(target, bytes)).state).toBe('completed');
  return {...source, db, files};
}
