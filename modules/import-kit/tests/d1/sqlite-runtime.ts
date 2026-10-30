import { DatabaseSync } from '../../../container/adapters/d1-sqlite.mjs';
import { d1Preflight, d1NativeLimits } from '../../../container/adapters/d1-limits.mjs';
import { sqliteRows } from './sqlite-text.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeD1ImportStorage, canonicalJson, sha256 } from '../../src/d1/index.ts';
import type { D1Database, D1ImportContext, D1TargetAdapter, TargetRow, SourceBundle, ImportMapping } from '../../src/d1/index.ts';
const sql = (sql: string, ...params: any[]) => ({ sql, params });
/** Real SQLite D1-shaped SQL port, used for cheap transaction/race probes.
 * The provider suite separately runs the same engine against real workerd D1. */
export function sqlitePort(native: DatabaseSync): D1Database {
  const port = (query: string, values: any[] = []): any => ({ query, values, bind(...next: any[]) { return port(query, next); }, async first() { d1Preflight(query, values); return sqliteRows(native, query, values, true)[0] ?? null; }, async all() { d1Preflight(query, values); return { results: sqliteRows(native, query, values) }; } });
  return { prepare(query) { return port(query); }, async batch(statements: any[]) { native.exec('BEGIN'); try { const result = statements.map(s => { d1Preflight(s.query, s.values); return sqliteRows(native, s.query, s.values); }); native.exec('COMMIT'); return result; } catch (e) { native.exec('ROLLBACK'); throw e; } } };
}
export const sqliteTargets: D1TargetAdapter = {
  async read(db, destination, kind, id) { const r = await db.prepare('SELECT * FROM native_records WHERE destination=? AND kind=? AND id=?').bind(destination, kind, id).first(); return r ? { destination, targetKind: kind, targetId: id, revision: r.revision, value: JSON.parse(r.value_json) } : undefined; },
  matches(row, destination, kind, id) { return row ? sql('EXISTS(SELECT 1 FROM native_records WHERE destination=? AND kind=? AND id=? AND revision=? AND value_json=?)', destination, kind, id, row.revision, canonicalJson(row.value)) : sql('NOT EXISTS(SELECT 1 FROM native_records WHERE destination=? AND kind=? AND id=?)', destination, kind, id); },
  write(row) { return [sql('INSERT INTO native_records VALUES(?,?,?,?,?) ON CONFLICT(destination,kind,id) DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json', row.destination, row.targetKind, row.targetId, row.revision, canonicalJson(row.value))]; },
  remove(destination, kind, id) { return [sql('DELETE FROM native_records WHERE destination=? AND kind=? AND id=?', destination, kind, id)]; },
  async list(db, destination) { const r = await db.prepare('SELECT * FROM native_records WHERE destination=? ORDER BY id').bind(destination).all(); return r.results.map(r => ({ destination, targetKind: r.kind, targetId: r.id, revision: r.revision, value: JSON.parse(r.value_json) })); },
  matchesCount(count, destination) { return sql('(SELECT COUNT(*) FROM native_records WHERE destination=?)=?', destination, count); },
  async preparePreservedUndo(db, destination, effects) {
    const rows = await this.list(db, destination);
    return { observations: effects.map(e => ({ effectId: e.provenance.id, current: rows.find(r => r.targetKind === e.expected.targetKind && r.targetId === e.expected.targetId) ?? null, entity: { table: 'native_records', recordId: e.expected.targetId } })), dependencies: [], guards: [this.matchesCount!(rows.length, destination), ...rows.map(r => this.matches(r, destination, r.targetKind, r.targetId))] };
  },
};
export const sqliteMapping: ImportMapping = { version: 'v1', map: r => ({ effects: [{ targetKind: 'record', targetId: r.sourceId, value: r.payload }] }) };
export function sqliteSource(count: number, label = 'original'): SourceBundle {
  const payloads = Array.from({ length: count }, (_, i) => ({ id: String(i), label })), bytes = Buffer.from(canonicalJson(payloads)), hash = sha256(bytes);
  return { diagnostics: [], artifacts: [{ name: 'input.json', sha256: hash, size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }], records: payloads.map((payload, i) => ({ namespace: 'archive', kind: 'record', sourceId: String(i), payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash, location: { artifact: 'input.json', row: i + 1 } })) };
}
export async function sqliteRuntime(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-sqlite-')), path = join(dir, 'data.sqlite');
  let native = new DatabaseSync(path, { limits: d1NativeLimits }), db = sqlitePort(native);
  native.exec('PRAGMA foreign_keys=ON');
  await initializeD1ImportStorage(db);
  native.exec("CREATE TABLE native_records(destination TEXT,kind TEXT,id TEXT,revision TEXT,value_json TEXT,PRIMARY KEY(destination,kind,id));CREATE TABLE native_authority(id TEXT PRIMARY KEY,enabled INTEGER);INSERT INTO native_authority VALUES('owner',1)");
  t.after(() => { native.close(); rmSync(dir, { recursive: true, force: true }); });
  return { db: () => db, native: () => native, reopen() { native.close(); native = new DatabaseSync(path, { limits: d1NativeLimits }); native.exec('PRAGMA foreign_keys=ON'); db = sqlitePort(native); }, context(): D1ImportContext { return { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', storage: { database: db, targets: sqliteTargets }, batchSize: 4, authorization: { principalId: 'owner', predicate: () => sql("EXISTS(SELECT 1 FROM native_authority WHERE id='owner' AND enabled=1)") } }; } };
}
