import { guard } from '@runeditrun/rer/modules/portability/storage';
import { emptyTargetSelects, bootstrapCustodyTables } from '../../src/core/features/portability/restore-plan.ts';
import { RestoreRefusal } from './restore-owner.mjs';

const replaceable = ['workspaces', 'members', 'workspace_policies', 'status_entries'];
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const deletion = name => `DELETE FROM ${quote(name)}`;
const incompatible = () => new RestoreRefusal('Restore refused: the installed archive engine has an incompatible commit boundary. Nothing was restored.');

/** Retain native bootstrap custody until Base admits and commits the archive.
 * Base's replaceable-table contract handles the four portable bootstrap tables.
 * Its D1 batch is extended with native guards and excluded-custody cleanup; no
 * reads, Base guards, or R2 ownership/cleanup operations are replaced.
 */
export async function bootstrapReplacement(db, policy, owner) {
  const checked = await db.batch([
    ...bootstrapCustodyTables.map(name => db.prepare(`SELECT rowid AS __rowid,* FROM ${quote(name)}`)),
    ...emptyTargetSelects.map(sql => db.prepare(sql)),
  ]);
  const snapshot = new Map(bootstrapCustodyTables.map((name, index) => [name, checked[index].results]));
  const members = snapshot.get('members');
  if (members.length > 1 || (members.length === 1 && String(members[0].email).toLowerCase() !== owner.toLowerCase()) ||
      checked.slice(bootstrapCustodyTables.length).some(result => !result.results[0]?.empty))
    throw new RestoreRefusal('Restore refused: this installation already holds workspace data. Import needs an empty installation; export what you need, then run rer reset --yes. Nothing was restored.');

  // Recheck both native emptiness and every retained bootstrap value in the
  // commit. A new session, changed owner, or changed vocabulary must not race
  // the read-only admission and silently become disposable.
  const nativeCommit = () => [
    ...emptyTargetSelects.map(sql => guard(db, `(${sql})=1`)),
    ...[...snapshot].flatMap(([name, rows]) => [
      guard(db, `(SELECT COUNT(*) FROM ${quote(name)})=?`, rows.length),
      ...rows.map(({ __rowid, ...row }) => guard(db,
        `EXISTS(SELECT 1 FROM ${quote(name)} WHERE rowid=? AND ${Object.keys(row).map(column => `${quote(column)} IS ?`).join(' AND ')})`,
        __rowid, ...Object.values(row))),
    ]),
    ...bootstrapCustodyTables.map(name => db.prepare(deletion(name))),
  ];
  const queries = new WeakMap(), deletes = new WeakMap();
  const adapter = {
    prepare(sql) {
      const statement = db.prepare(sql);
      // Replacement deletes are batch-only capabilities: a future engine
      // cannot accidentally run one outside the guarded atomic commit.
      const refused = () => { throw incompatible(); };
      const prepared = replaceable.some(name => sql === deletion(name))
        ? { bind: refused, run: refused, all: refused, first: refused, raw: refused } : statement;
      if (prepared !== statement) deletes.set(prepared, statement);
      queries.set(prepared, sql);
      return prepared;
    },
    async batch(statements) {
      const sql = statements.map(statement => queries.get(statement));
      const nativeDeletes = sql.filter(query => replaceable.some(name => query === deletion(name)));
      if (!nativeDeletes.length) return db.batch(statements);
      // These are the pinned Base finalizer's actual prepared statements. A
      // changed/partial commit cannot delete bootstrap under this integration.
      if (nativeDeletes.length !== replaceable.length || !replaceable.every(name => nativeDeletes.includes(deletion(name))) ||
          sql[0] !== 'PRAGMA defer_foreign_keys=ON' ||
          !sql.includes('UPDATE rer_portability_state SET import_job=NULL,applying=0 WHERE id=1') ||
          sql.at(-1) !== 'DELETE FROM rer_portability_guard') throw incompatible();
      const firstDelete = sql.findIndex(query => (policy.replaceableTables ?? []).concat(replaceable).some(name => query === deletion(name)));
      const added = nativeCommit();
      const original = statements.map(statement => deletes.get(statement) ?? statement);
      const results = await db.batch([...original.slice(0, firstDelete), ...added, ...original.slice(firstDelete)]);
      return [...results.slice(0, firstDelete), ...results.slice(firstDelete + added.length)];
    },
  };
  return { db: adapter, policy: { ...policy, replaceableTables: [...new Set([...(policy.replaceableTables ?? []), ...replaceable])] } };
}
