/** Clear product data through SQLite's writable tables, never FTS shadow storage. */
export async function resetDatabase(db: D1Database): Promise<void> {
  const tables = (await db.prepare('PRAGMA table_list').all<{
    schema: string;
    name: string;
    type: string;
  }>()).results.filter(({ schema, name, type }) =>
    schema === 'main' && (type === 'table' || type === 'virtual') &&
    !name.startsWith('sqlite_') && !name.startsWith('_cf_') &&
    // Both singleton counters must survive so later native writes still
    // invalidate authorization and caller-specific record projections.
    !['d1_migrations', 'core_acl_epoch', 'search_record_epoch', 'ik_d1_stream_revisions'].includes(name),
  );
  // Canonical delete triggers enqueue invalidations. Drain their queue only
  // after all source tables are empty, independent of PRAGMA's table order.
  const order=(name:string)=>name==='ik_d1_publication_fences'?-3:name==='ik_d1_creation_plans'?-2:name==='ik_jobs'?-1:name==='search_dirty'?1:0;
  tables.sort((a,b)=>order(a.name)-order(b.name));
  // The Kit revision tombstone is deliberately immutable in product operations.
  // Test isolation creates a truly empty deployment, then restores its triggers.
  const revisionTriggers=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='ik_d1_stream_revisions'").all<{name:string;sql:string}>()).results;
  await db.batch([
    db.prepare('PRAGMA defer_foreign_keys=ON'),
    ...revisionTriggers.map(trigger=>db.prepare(`DROP TRIGGER "${trigger.name}"`)),
    db.prepare('DELETE FROM ik_d1_stream_revisions'),
    db.prepare('UPDATE ik_d1_creation_plans SET released=1 WHERE released=0'),
    ...tables.map(({ name }) => db.prepare(`DELETE FROM "${name.replaceAll('"', '""')}"`)),
    ...revisionTriggers.map(trigger=>db.prepare(trigger.sql)),
  ]);
}
