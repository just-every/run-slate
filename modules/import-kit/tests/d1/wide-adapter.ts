import { scaleTargets } from './scale-adapter.ts';
import { targets } from './fixtures.ts';
import { sql } from '../../src/d1/database.ts';
import type { D1TargetAdapter, TargetRow } from '../../src/d1/index.ts';

// A real native entity with a wide companion table. Single-row matching uses
// SQL tuples; export uses exact JSON set predicates like an edition adapter.
export const fields = Array.from({ length: 18 }, (_, i) => `f${i}`);
export const detail = (id: string) => Object.fromEntries(fields.map(f => [f, `${id}:${f}:🌱`]));
const values = (row: TargetRow) => (row.value as any).details;
const columns = ['c.destination', 'c.kind', 'c.id', 'c.revision', 'c.email', 'e.detail', ...fields.map(f => `d.${f}`)];
export const wideTargets: D1TargetAdapter = {
  ...scaleTargets,
  async read(db, destination, kind, id) {
    const row = await targets.read(db, destination, kind, id);
    if (!row) return undefined;
    const details = await db.prepare(`SELECT ${fields.join(',')} FROM details WHERE id=?`).bind(id).first();
    return { ...row, value: { ...row.value as any, details } };
  },
  matches(row, destination, kind, id) {
    const base = targets.matches(row, destination, kind, id);
    return row ? sql(`(${base.sql}) AND EXISTS(SELECT 1 FROM details WHERE (id,${fields.join(',')}) IS (${Array(fields.length + 1).fill('?').join(',')}))`, ...base.params!, id, ...fields.map(f => values(row)[f]))
      : sql(`(${base.sql}) AND NOT EXISTS(SELECT 1 FROM details WHERE id=?)`, ...base.params!, id);
  },
  write(row) { return [...targets.write(row), sql(`INSERT INTO details(id,${fields.join(',')}) VALUES(${Array(fields.length + 1).fill('?').join(',')})`, row.targetId, ...fields.map(f => values(row)[f]))]; },
  remove(destination, kind, id) { return [sql('DELETE FROM details WHERE id=?', id), ...targets.remove(destination, kind, id)]; },
  async list(db, destination) {
    const { results } = await db.prepare('SELECT c.*,e.detail,d.* FROM contacts c JOIN evidence e ON e.id=c.id JOIN details d ON d.id=c.id WHERE c.destination=?').bind(destination).all();
    return results.map(r => ({ destination, targetKind: r.kind, targetId: r.id, revision: r.revision, value: { email: r.email, evidence: r.detail, details: Object.fromEntries(fields.map(f => [f, r[f]])) } }));
  },
  matchesMany(rows, destination) {
    const predicates = ['contacts', 'evidence', 'details'].map(table => sql(`(SELECT COUNT(*) FROM ${table})=?`, rows.length));
    const snapshots = rows.map(row => [destination, row.targetKind, row.targetId, row.revision, (row.value as any).email, (row.value as any).evidence, ...fields.map(f => values(row)[f])]);
    const predicate = `NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM contacts c JOIN evidence e ON e.id=c.id JOIN details d ON d.id=c.id WHERE ${columns.map((c, i) => `${c} IS json_extract(j.value,'$[${i}]')`).join(' AND ')}))`;
    for (let i = 0; i < snapshots.length; i += 10) predicates.push(sql(predicate, JSON.stringify(snapshots.slice(i, i + 10))));
    return predicates;
  }
};
