// PORT-005 for `rer import`: Base's importer writes archive rows as given, so an
// archive changed after export could bring back live authority, such as an
// unrevoked public link or agent credential. Every imported row is set to what
// export would have written; rows from an intact export are already in that
// form and stay untouched. Members are decided by restoreOwner.
import { memberAccess } from '../../src/core/features/portability/rows.ts';

export async function normaliseImported(db, policy, tables) {
  const statements = [];
  for (const table of tables.filter(name => name !== 'members'))
    for (const { __rowid, ...row } of (await db.prepare(`SELECT rowid AS __rowid,* FROM "${table}"`).all()).results) {
      const exported = policy.exportRow(table, row);
      const changed = Object.keys(exported).filter(column => !Object.is(exported[column], row[column]));
      if (changed.length) statements.push(db.prepare(`UPDATE "${table}" SET ${changed.map(column => `"${column}"=?`).join(',')} WHERE rowid=?`).bind(...changed.map(column => exported[column]), __rowid));
    }
  if (statements.length) await db.batch(statements);
  return statements.length;
}

/** Drops grants and memberships an archive gives a removed member, with one warning per row. */
export async function dropRemovedMemberAccess(db, tables) {
  const removed = new Set((await db.prepare("SELECT id FROM members WHERE status='removed'").all()).results.map(row => row.id));
  const statements = [], warnings = [];
  for (const [table, member] of Object.entries(memberAccess).filter(([name]) => tables.includes(name)))
    for (const { __rowid, ...row } of (await db.prepare(`SELECT rowid AS __rowid,* FROM "${table}"`).all()).results) {
      if (!removed.has(member(row))) continue;
      statements.push(db.prepare(`DELETE FROM "${table}" WHERE rowid=?`).bind(__rowid));
      warnings.push(`Left out ${table.replace('_', ' ').replace(/s$/, '')} ${row.id ?? `${row.group_id ?? row.container_id}/${member(row)}`}: it gives access to member ${member(row)}, who was removed before the export.`);
    }
  if (statements.length) await db.batch(statements);
  return warnings;
}
