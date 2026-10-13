import { canonicalJson, targetIdentity } from '../../src/provenance/identity.ts';
import { jsonChunks } from '../../src/d1/sets.ts';
import { sql } from '../../src/d1/database.ts';
import { sqliteTargets } from './sqlite-runtime.ts';
import type { D1TargetAdapter, D1ImportContext } from '../../src/d1/types.ts';
import type { D1UndoEffect, D1UndoSnapshot } from '../../src/d1/undo-types.ts';

/** Test adapter for the real SQLite native table, with exact byte/value/type
 * matching and a complete destination count, including an empty native set. */
export const nativeSetTargets: D1TargetAdapter = {
  ...sqliteTargets,
  matchesMany(rows, destination) {
    const columns = ['destination','kind','id','revision','value_json'];
    return [sql('(SELECT COUNT(*) FROM native_records WHERE destination=?)=?', destination, rows.length),
      ...jsonChunks(rows.map(row => [row.destination, row.targetKind, row.targetId, row.revision, canonicalJson(row.value)]))
        .map(chunk => sql(`NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM native_records n WHERE ${columns.map((column, i) => `n.${column} IS json_extract(e.value,'$[${i}]') AND typeof(n.${column})=typeof(json_extract(e.value,'$[${i}]'))`).join(' AND ')}))`, chunk))];
  },
  async preparePreservedUndo(db, destination, effects) {
    const nativeRows = await sqliteTargets.list(db, destination);
    const indexed = new Map(nativeRows.map(row => [targetIdentity(destination, row.targetKind, row.targetId), row]));
    return { nativeRows, observations: effects.map(effect => ({ effectId: effect.provenance.id,
      current: indexed.get(targetIdentity(destination, effect.expected.targetKind, effect.expected.targetId)) ?? null,
      entity: { table: 'native_records', recordId: effect.expected.targetId } })), dependencies: [], guards: [sqliteTargets.matchesCount!(nativeRows.length, destination)] };
  },
};

export function classification(count = 3) {
  const effects: D1UndoEffect[] = Array.from({ length: count }, (_, i) => ({ retained: false,
    provenance: { id: String(i), jobId: 'job', before: null } as any,
    expected: { destination: 'workspace', targetKind: 'record', targetId: String(i), revision: 'r', value: { number: i, nullable: null } } }));
  const rows = effects.map(e => structuredClone(e.expected));
  const snapshot: D1UndoSnapshot = { nativeRows: rows, observations: effects.map((e, i) => ({ effectId: e.provenance.id, current: rows[i], entity: { table: 'records', recordId: String(i) } })), dependencies: [], guards: [{ sql: '1' }] };
  const context = { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', storage: { targets: nativeSetTargets }, authorization: { principalId: 'owner', predicate: () => ({ sql: '1' }) } } as D1ImportContext;
  return { effects, snapshot, context };
}
