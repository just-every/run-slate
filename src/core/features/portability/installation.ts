import { excludedTables, derivedSearchTables } from './tables';
import { forbiddenColumns, schema, type DataRow } from './archive';
import { restoredRow } from './rows';
// Facts and native identity lineage move; execution authority must be renewed.
const restoredAt = '1970-01-01T00:00:00.000Z';
const agentMetadata = 'intelligence_agent_credentials';
const omittedTables = excludedTables.filter(name => name !== agentMetadata);
export async function installationPolicy(db: D1Database) {
  const columns = await schema(db); // Native inventory refuses unregistered product tables and excludes D1 internals.
  columns[agentMetadata] = (await db.prepare(`PRAGMA table_info("${agentMetadata}")`).all<{name:string}>()).results.map(column => column.name);
  const secretColumns: Record<string, string[]> = {};
  for (const [name, names] of Object.entries(columns)) {
    // This native table's NOT NULL UNIQUE digest cannot be omitted. Its export
    // projection replaces it with a non-digest tombstone, as native erasure does.
    const secrets = names.filter(column => forbiddenColumns.test(column) && !(name === agentMetadata && column === 'token_hash'));
    if (secrets.length) secretColumns[name] = secrets;
  }
  return {
    product: 'just-every/slate', excludeTables: omittedTables, derivedTables: [...derivedSearchTables],
    secretColumns, replaceableTables: ['import_native_epoch'],
    requiredConfiguration: ['APP_URL', 'SETUP_OWNER_EMAIL', 'SESSION_SECRET', 'LOCAL_DEVELOPMENT', 'MAIL_PROVIDER', 'MAIL_FROM'],
    buckets: { FILES: {} },
    exportRow(table: string, row: DataRow) {
      if (table === agentMetadata) return { ...row, token_hash: 'erased:' + row.id, scope_json: '{}', expires_at: restoredAt, revoked_at: row.revoked_at ?? restoredAt };
      const owner = table === 'members' && row.is_setup_owner === 1 ? String(row.email) : '';
      return restoredRow(table, row, owner, restoredAt, new Map());
    },
  };
}
