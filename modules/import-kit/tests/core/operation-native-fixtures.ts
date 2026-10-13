import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ImportContext, ImportMapping, SourceBundle, TargetAdapter, TargetRow } from '../../src/types.ts';
import { openSqliteImportStorage, canonicalJson, sha256, planImport, createImportJob } from '../../src/index.ts';

const tables = { article: 'native_articles', link: 'native_links', attachment: 'native_attachments' };
export const nativeTargets: TargetAdapter = {
  read(db, destination, kind, id) {
    const table = tables[kind]; if (!table) throw new Error('unsupported native kind');
    const row = db.prepare(`SELECT * FROM ${table} WHERE destination=? AND id=?`).get(destination, id);
    if (!row) return;
    const value = kind === 'article' ? { title: row.title, body: row.body } : kind === 'link' ? { article: row.article_id, label: row.label } : { article: row.article_id, name: row.name };
    return { destination, targetKind: kind, targetId: id, value, revision: row.revision, ...(kind === 'attachment' ? { attachment: { base64: Buffer.from(row.bytes).toString('base64'), sha256: sha256(row.bytes), mediaType: row.media_type } } : {}) };
  },
  write(db, row) {
    const v = row.value as any;
    if (row.targetKind === 'article') db.prepare('INSERT INTO native_articles VALUES(?,?,?,?,?) ON CONFLICT(destination,id) DO UPDATE SET title=excluded.title,body=excluded.body,revision=excluded.revision').run(row.destination, row.targetId, v.title, v.body, row.revision);
    else if (row.targetKind === 'link') db.prepare('INSERT INTO native_links VALUES(?,?,?,?,?) ON CONFLICT(destination,id) DO UPDATE SET article_id=excluded.article_id,label=excluded.label,revision=excluded.revision').run(row.destination, row.targetId, v.article, v.label, row.revision);
    else if (row.targetKind === 'attachment') db.prepare('INSERT INTO native_attachments VALUES(?,?,?,?,?,?,?) ON CONFLICT(destination,id) DO UPDATE SET article_id=excluded.article_id,name=excluded.name,bytes=excluded.bytes,media_type=excluded.media_type,revision=excluded.revision').run(row.destination, row.targetId, v.article, v.name, Buffer.from(row.attachment!.base64, 'base64'), row.attachment!.mediaType, row.revision);
    else throw new Error('unsupported native kind');
  },
  remove(db, destination, kind, id) { db.prepare(`DELETE FROM ${tables[kind]} WHERE destination=? AND id=?`).run(destination, id); },
  list(db, destination) {
    return Object.entries(tables).flatMap(([kind, table]) => db.prepare(`SELECT id FROM ${table} WHERE destination=? ORDER BY id`).all(destination).map(row => nativeTargets.read(db, destination, kind, row.id)!));
  }
};
export function nativeContext(path: string, targets = nativeTargets): ImportContext {
  const storage = openSqliteImportStorage(path, { targets });
  storage.database.exec(`
    CREATE TABLE IF NOT EXISTS native_articles(destination TEXT,id TEXT,title TEXT,body TEXT,revision TEXT,PRIMARY KEY(destination,id));
    CREATE TABLE IF NOT EXISTS native_links(destination TEXT,id TEXT,article_id TEXT,label TEXT,revision TEXT,PRIMARY KEY(destination,id),FOREIGN KEY(destination,article_id) REFERENCES native_articles(destination,id));
    CREATE TABLE IF NOT EXISTS native_attachments(destination TEXT,id TEXT,article_id TEXT,name TEXT,bytes BLOB,media_type TEXT,revision TEXT,PRIMARY KEY(destination,id),FOREIGN KEY(destination,article_id) REFERENCES native_articles(destination,id));
    CREATE TABLE IF NOT EXISTS native_authority(id TEXT PRIMARY KEY,allowed INTEGER);
    INSERT OR IGNORE INTO native_authority VALUES('owner',1);
  `);
  return { storage, destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', batchSize: 1, authorization: { principalId: 'owner', assertAuthorized(_action, _destination, db) { if (db.prepare("SELECT allowed FROM native_authority WHERE id='owner'").get()?.allowed !== 1) throw new Error('NOT_AUTHORIZED'); } } };
}
export function nativeSetup(t: any, targets = nativeTargets) {
  const directory = mkdtempSync(join(tmpdir(), 'import-native-integrity-')), path = join(directory, 'data.sqlite'), ctx = nativeContext(path, targets);
  t.after(() => { ctx.storage.close(); rmSync(directory, { recursive: true, force: true }); });
  return { ctx, path };
}
export function nativeSource(): SourceBundle {
  const bytes = Buffer.from(' {"records": [ {"id":"0","title":"Zero"}, {"id":"1","title":"One"} ], "unmapped":"retained"}\r\n');
  const hash = sha256(bytes);
  return { artifacts: [{ name: 'archive.json', sha256: hash, size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }], diagnostics: [], records: JSON.parse(bytes.toString()).records.map((payload, index) => ({ namespace: 'archive', kind: 'document', sourceId: payload.id, payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash, location: { artifact: 'archive.json', pointer: '/records/' + index } })) };
}
export const nativeMapping: ImportMapping = { version: 'v1', map: source => ({ effects: [
  { targetKind: 'article', targetId: source.sourceId, value: { title: (source.payload as { title: string }).title, body: 'Retained article ' + source.sourceId } },
  { targetKind: 'link', targetId: source.sourceId, value: { article: source.sourceId, label: 'Source link' } },
  { targetKind: 'attachment', targetId: source.sourceId, value: { article: source.sourceId, name: source.sourceId + '.bin' }, attachment: { base64: Buffer.from([0, 255, Number(source.sourceId), 13, 10]).toString('base64'), sha256: sha256(Buffer.from([0, 255, Number(source.sourceId), 13, 10])), mediaType: 'application/octet-stream' } }
] }) };
export async function nativeJob(ctx: ImportContext, mapping = nativeMapping) {
  const plan = planImport(nativeSource(), mapping, ctx); ctx.reviewedFingerprint = plan.fingerprint;
  return { plan, job: await createImportJob(plan, ctx) };
}
export function nativeRows(ctx: ImportContext): TargetRow[] { return nativeTargets.list(ctx.storage.database, ctx.destination); }
export function snapshot(ctx: ImportContext) {
  const db = ctx.storage.database;
  return { native: nativeRows(ctx), tables: Object.fromEntries(['ik_jobs', 'ik_sources', 'ik_provenance', 'ik_batches', 'ik_stages', 'ik_originals'].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])) };
}
export function firstArticle(ctx: ImportContext) { return ctx.storage.database.prepare("SELECT * FROM ik_provenance WHERE ordinal=0 AND effect_ordinal=0 ORDER BY rowid LIMIT 1").get(); }
