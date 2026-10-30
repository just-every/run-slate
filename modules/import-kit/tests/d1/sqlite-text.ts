import { DatabaseSync } from 'node:sqlite';
import { d1Preflight, d1ResultPreflight, guardD1Rows } from '../../../container/adapters/d1-limits.mjs';

/** Node 22's native TEXT conversion can truncate at NUL. Read SQL values through
 * SQLite's hex representation, preserving the full UTF-8 bytes on every Node
 * version. Only the test port needs this transport correction; product SQL and
 * custody comparisons remain unchanged. One materialized SELECT executes the
 * original query once, retaining its SQL and binding order. */
export function sqliteRows(native: DatabaseSync, query: string, values: any[], first = false) {
  d1Preflight(query, values);
  guardD1Rows(native, sql => DatabaseSync.prototype.prepare.call(native, sql), sql => DatabaseSync.prototype.exec.call(native, sql));
  const statement = native.prepare(query), columns = statement.columns();
  const read = selectText(query);
  // Non-SELECT statement grammars (including setup PRAGMA) stay native.
  const execute = (prepared: ReturnType<DatabaseSync['prepare']>) => {
    if (!first) return prepared.all(...values);
    const row = prepared.get(...values); return row ? [row] : [];
  };
  if (!columns.length || !read) { const rows = execute(statement); d1ResultPreflight(rows); return rows; }
  const names = columns.map((_, i) => `c${i}`);
  let relation = 'ik_test_rows';
  while (query.toLowerCase().includes(relation)) relation += '_';
  const body = first ? `SELECT * FROM (${read}\n) LIMIT 1` : read;
  const projection = names.flatMap((name, i) => [`typeof(${name}) AS t${i}`, `CASE WHEN typeof(${name})='text' THEN hex(${name}) ELSE ${name} END AS v${i}`]);
  const rows = execute(DatabaseSync.prototype.prepare.call(native, `WITH ${relation}(${names.join(',')}) AS MATERIALIZED (${body}\n) SELECT ${projection.join(',')} FROM ${relation}`));
  const result = rows.map(row => {
    const decoded: Record<string, any> = Object.create(Object.getPrototypeOf(row));
    for (const [i, column] of columns.entries()) {
      const value = row[`t${i}`] === 'text' ? Buffer.from(row[`v${i}`] as string, 'hex').toString('utf8') : row[`v${i}`];
      Object.defineProperty(decoded, column.name, { value, enumerable: true, writable: true, configurable: true });
    }
    return decoded;
  });
  d1ResultPreflight(result);
  return result;
}

// Keep only top-level grammar tokens; quoted names and nested CTE bodies are
// opaque. This classifies WITH ... DML without executing a second query.
function selectText(query: string): string | undefined {
  const tokens: string[] = []; let last = -1, depth = 0;
  for (let i = 0; i < query.length; i++) {
    const c = query[i];
    if (/\s/.test(c)) continue;
    if (query.startsWith('--', i)) { const end = query.indexOf('\n', i + 2); i = end < 0 ? query.length : end; continue; }
    if (query.startsWith('/*', i)) { const end = query.indexOf('*/', i + 2); i = end < 0 ? query.length : end + 1; continue; }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      if (!depth) tokens.push('quoted-name');
      for (i++; i < query.length; i++) if (query[i] === close) {
        if (close !== ']' && query[i + 1] === close) { i++; continue; }
        break;
      }
    } else if (c === '(') { if (depth++ === 0) tokens.push('('); }
    else if (c === ')') { if (--depth === 0) tokens.push(')'); }
    else if (/[\w$\u0080-\uFFFF]/.test(c)) {
      const start = i; while (i + 1 < query.length && /[\w$\u0080-\uFFFF]/.test(query[i + 1])) i++;
      if (!depth) tokens.push(query.slice(start, i + 1).toUpperCase());
    } else if (!depth) tokens.push(c);
    last = i;
  }
  let index = 0;
  if (tokens[index] === 'WITH') {
    index++; if (tokens[index] === 'RECURSIVE') index++;
    do {
      index++; // CTE name (including a quoted or Unicode identifier).
      if (tokens[index] === '(') index += 2; // Optional column-name group.
      if (tokens[index++] !== 'AS') return undefined;
      if (tokens[index] === 'NOT') index++;
      if (tokens[index] === 'MATERIALIZED') index++;
      if (tokens[index++] !== '(' || tokens[index++] !== ')') return undefined;
      if (tokens[index] !== ',') break;
      index++;
    } while (index < tokens.length);
  }
  if (tokens[index] !== 'SELECT' && tokens[index] !== 'VALUES') return undefined;
  return query[last] === ';' ? query.slice(0, last) + query.slice(last + 1) : query;
}
