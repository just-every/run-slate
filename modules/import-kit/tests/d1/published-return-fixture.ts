import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping } from './sqlite-runtime.ts';
import { normalizedPreparation, emptyPreparationTables } from './preparation-fixture.ts';
import { planD1ImportStream, createD1ImportStream, prepareD1ImportStream, publishD1ImportPreparation, type D1ImportContext, type D1Database } from '../../src/d1/index.ts';
import { checkSql } from '../../src/d1/budget.ts';
import { stagingBatchBytes, STAGING_BATCH_BYTES } from '../../src/d1/staging-transport.ts';

export type ReturnPath = 'fresh' | 'cold';
export const caps = [undefined, STAGING_BATCH_BYTES];
export const isReceipt = (queries: string[]) => queries.some(query => query === 'SELECT * FROM ik_d1_streams WHERE id=?');
export const isPublication = (queries: string[]) => queries.some(query => query.startsWith('INSERT INTO ik_d1_streams('));

export async function returnFixture(t: any, path: ReturnPath, maxBatchBytes?: number, count = 203) {
  const r = await sqliteRuntime(t), source = normalizedPreparation(count);
  const context = () => ({ ...r.context(), maxBatchBytes });
  const plan = await planD1ImportStream(source, sqliteMapping, context());
  const preparation = path === 'cold' ? await prepareD1ImportStream(source, sqliteMapping, { ...context(), reviewedFingerprint: plan.fingerprint }) : undefined;
  return { ...r, plan, context, preparation, async invoke(input: D1ImportContext) {
    return path === 'cold' ? publishD1ImportPreparation(preparation!.id, input) : createD1ImportStream(plan, { ...input, reviewedFingerprint: plan.fingerprint });
  } };
}

/** Observe the real SQLite transaction port without changing its statements or
 * its transaction boundaries. Hooks run only before BEGIN or after COMMIT. */
export function returnObserver(db: D1Database, hook: (phase: 'before' | 'after', queries: string[], statements: any[]) => void | Promise<void> = () => {}) {
  const batches: string[][] = [], rawReads: string[] = [];
  let executions = 0, largestBatch = 0;
  const wrapped = new WeakMap<object, any>();
  const statement = (query: string, raw: any): any => {
    const result = { bind(...values: any[]) { return statement(query, raw.bind(...values)); },
      async first(...args: any[]) { executions++; rawReads.push(query); return raw.first(...args); },
      async all(...args: any[]) { executions++; rawReads.push(query); return raw.all(...args); } };
    wrapped.set(result, raw); return result;
  };
  const database: D1Database = { prepare: query => statement(query, db.prepare(query)), async batch(prepared: any[]) {
    const statements = prepared.map(item => wrapped.get(item)), queries = statements.map(item => item.query);
    const sql = statements.map(item => ({ sql: item.query, params: item.values }));
    sql.forEach(checkSql); const bytes = stagingBatchBytes(sql); largestBatch = Math.max(largestBatch, bytes);
    assert.ok(bytes <= STAGING_BATCH_BYTES); executions += statements.length; batches.push(queries);
    await hook('before', queries, statements);
    const result = await db.batch(statements);
    await hook('after', queries, statements);
    return result;
  } };
  return { database, batches, rawReads, get executions() { return executions; }, get largestBatch() { return largestBatch; } };
}

export function assertPublishedOnly(r: Awaited<ReturnType<typeof returnFixture>>) {
  emptyPreparationTables(r.native());
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_streams').get()!.n, 1);
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n, 0);
  assert.equal(r.native().prepare('SELECT count(*) n FROM ik_d1_publication_fences').get()!.n, 0);
}
