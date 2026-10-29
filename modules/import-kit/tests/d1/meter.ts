import assert from 'node:assert/strict';
const bytes = (v: any): number => v == null ? 0 : typeof v === 'string' ? Buffer.byteLength(v) : ArrayBuffer.isView(v) || v instanceof ArrayBuffer ? v.byteLength : typeof v === 'object' ? Object.values(v).reduce<number>((n, x) => n + bytes(x), 0) : 8;
/** Counts D1 calls and records every individual statement in a real batch,
 * checking their rows, parameters and bytes independently across the request. */
export function meter(database: any) {
  let count = 0, statements = 0, bindings = 0, sqlBytes = 0, valueBytes = 0, rows = 0, boundBytes = 0;
  const snapshots: any[] = [];
  const check = (query: string, values: any[]) => {
    statements++;
    boundBytes += values.reduce<number>((n, v) => n + bytes(v), 0);
    bindings = Math.max(bindings, values.length); sqlBytes = Math.max(sqlBytes, bytes(query));
    valueBytes = Math.max(valueBytes, ...values.map(bytes), 0);
    assert.ok(bindings <= 100, `D1_BINDINGS:${bindings}`); assert.ok(sqlBytes <= 100000, `D1_SQL_BYTES:${sqlBytes}`); assert.ok(valueBytes <= 2000000, `D1_VALUE_BYTES:${valueBytes}`);
  };
  const returned = (result: any) => { for (const row of result?.results ?? (result ? [result] : [])) { rows++; valueBytes = Math.max(valueBytes, bytes(row)); assert.ok(bytes(row) <= 2000000, `D1_ROW_BYTES:${bytes(row)}`); } return result; };
  const wrap = (raw: any, query: string, values: any[] = []): any => ({ statement: raw, query, values,
    bind(...next: any[]) { return wrap(raw.bind(...next), query, next); },
    async first(...args: any[]) { assert.ok(++count <= 1000); check(query, values); return returned(await raw.first(...args)); },
    async all(...args: any[]) { assert.ok(++count <= 1000); check(query, values); return returned(await raw.all(...args)); },
    async run(...args: any[]) { assert.ok(++count <= 1000); check(query, values); return returned(await raw.run(...args)); },
    async raw(...args: any[]) { assert.ok(++count <= 1000); check(query, values); return returned(await raw.raw(...args)); }
  });
  return { database: { prepare(query: string) { return wrap(database.prepare(query), query); }, async batch(statements: any[]) { assert.ok(++count <= 1000); for (const s of statements) check(s.query, s.values); return (await database.batch(statements.map(s => s.statement))).map(returned); } },
    async request<T>(name: string, fn: () => Promise<T>): Promise<T> { count = statements = bindings = sqlBytes = valueBytes = rows = boundBytes = 0; try { return await fn(); } catch (error) { console.log(JSON.stringify({ failedRequest: name, count, bindings, sqlBytes, valueBytes })); throw error; } finally { snapshots.push({ name, count, statements, bindings, sqlBytes, valueBytes, rows, boundBytes }); } }, snapshots };
}
