import assert from 'node:assert/strict';
import { nativeStagingStorageFixture } from './native-staging-fixture.ts';
import { retireD1ImportCustodyStep, type D1ErasureStepOptions } from '../../src/d1/index.ts';

/** The only simulated edge is D1's hosted RPC limit. SQL, transactions,
 * insertion triggers and the native publication adapter all execute in SQLite. */
export async function erasureStepFixture(t: any) {
  const r = await nativeStagingStorageFixture(t);
  r.native().exec('CREATE TABLE privacy_epoch(value INTEGER NOT NULL)');
  const targets = { ...r.targets, planCodec: undefined, write(row: Parameters<typeof r.targets.write>[0]) { return [...r.targets.remove(row.destination, row.targetKind, row.targetId), ...r.targets.write(row)]; } };
  let executions = 0, maximum = 0, erasing = false;
  let fault: ((queries: any[]) => boolean) | undefined;
  const measure = (value: unknown, mutation = false) => {
    const json = JSON.stringify(value), bytes = Math.max(Buffer.byteLength(json), json.length * (/[^\u0000-\u00ff]/.test(json) ? 2 : 1));
    assert.ok(bytes < 32 * 1024 * 1024, `hosted D1 RPC: ${bytes}`);
    if (erasing && mutation) { maximum = Math.max(maximum, bytes); assert.ok(bytes <= 1024 * 1024, `erasure batch: ${bytes}`); }
  };
  const database = () => {
    const native = r.db();
    const wrap = (statement: any): any => ({
      query: statement.query, values: statement.values,
      bind(...values: any[]) { return wrap(statement.bind(...values)); },
      async first() { executions++; measure([{ sql: statement.query, params: statement.values }]); const result = await statement.first(); measure(result); return result; },
      async all() { executions++; measure([{ sql: statement.query, params: statement.values }]); const result = await statement.all(); measure(result); return result; },
      async run() { return this.all(); },
    });
    return { prepare: (query: string) => wrap(native.prepare(query)), async batch(statements: any[]) {
      executions += statements.length;
      const queries = statements.map(s => ({ sql: s.query, params: s.values }));
      measure(queries, true); const result = await native.batch(statements); measure(result);
      if (fault?.(queries)) { fault = undefined; throw new Error('test connection lost after commit'); }
      return result;
    } };
  };
  const context = () => ({ ...r.context(), storage: { database: database(), targets } });
  const checkpoint = [{ sql: 'UPDATE privacy_epoch SET value=value+1' }];
  async function erase(id: string, options: D1ErasureStepOptions) {
    erasing = true; executions = 0; maximum = 0;
    const result = await retireD1ImportCustodyStep({ target: { kind: 'record', id } }, targets.remove('workspace', 'record', id), { ...context(), maxBatchBytes: 1024 * 1024 }, checkpoint, options);
    assert.ok(executions <= (options.maxStatements ?? 1000), `${executions} statements`);
    return { response: Response.json(result, { status: result.phase === 'pending' ? 202 : 200 }), result, executions, maximum };
  }
  return { ...r, targets, context, database, archiveDatabase: () => { erasing = false; return database(); }, erase, checkpoint, fault: (next: (queries: any[]) => boolean) => { fault = next; } };
}
