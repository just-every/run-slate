import assert from 'node:assert/strict';
import type { D1Database, D1ImportContext } from '../../src/d1/types.ts';
import { readD1ImportJob, readD1ImportOriginals, readD1PersistedImport, readD1ImportUndoReport } from '../../src/d1/index.ts';

export const publicReads = (id: string, context: D1ImportContext) => [
  () => readD1ImportJob(id, context),
  () => readD1ImportOriginals(id, context),
  () => readD1PersistedImport(context),
  () => readD1ImportUndoReport(id, context, { offset: 0, limit: 1 }),
];
/** Instrument executed SQL, retaining real driver transactions and results. */
export function observeReads(db: D1Database, beforeBatch?: (queries: string[]) => Promise<void> | void) {
  const executed: string[] = [], raw = new WeakMap<object, any>(), text = new WeakMap<object, string>();
  const wrap = (statement: any, query: string): any => {
    const wrapped = { bind(...values: any[]) { return wrap(statement.bind(...values), query); },
      async first() { executed.push(query); return statement.first(); },
      async all() { executed.push(query); return statement.all(); } };
    raw.set(wrapped, statement); text.set(wrapped, query); return wrapped;
  };
  const database: D1Database = { prepare(query) { return wrap(db.prepare(query), query); }, async batch(statements) {
    const queries = statements.map(s => text.get(s)!);
    await beforeBatch?.(queries); executed.push(...queries);
    return db.batch(statements.map(s => raw.get(s)));
  } };
  return { database, executed, assertSelectOnly() { assert.ok(executed.length > 0); assert.ok(executed.every(q => q.startsWith('SELECT ')), executed.join('\n')); } };
}
export function sqliteSnapshot(native: any) {
  const schema = native.prepare('SELECT * FROM sqlite_master ORDER BY type,name').all();
  const tables = schema.filter((r: any) => r.type === 'table').map((r: any) => r.name);
  return { schema, rows: Object.fromEntries(tables.map((table: string) => [table, native.prepare(`SELECT * FROM "${table.replaceAll('"', '""')}" ORDER BY rowid`).all()])) };
}
export const totalChanges = (native: any): number => native.prepare('SELECT total_changes() AS n').get().n;
