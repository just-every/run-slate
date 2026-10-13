import { sqliteTargets, canonicalJson, sha256 } from '../../src/index.ts';
import type { TargetAdapter, TargetRow, SqlDatabase } from '../../src/index.ts';
export const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
export function keyColumns(db: SqlDatabase, table: string): string[] {
  const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all();
  const primary = columns.filter(c => c.pk).sort((a,b) => a.pk-b.pk).map(c => c.name);
  if (!primary.length) throw new Error(`Native table lacks primary key: ${table}`);
  return primary;
}
export function rowKey(db: SqlDatabase, table: string, row: any): string { return canonicalJson(keyColumns(db,table).map(c=>row[c])); }
export function findRow(db: SqlDatabase, table: string, key: string): any {
  return db.prepare(`SELECT * FROM ${quote(table)} WHERE ${keyColumns(db,table).map(c=>`${quote(c)} IS ?`).join(' AND ')}`).get(...JSON.parse(key));
}
export function insertRow(db: SqlDatabase, table: string, row: any) {
  const columns=Object.keys(row);
  db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));
}
export function statements(db: SqlDatabase, commands: any[] = []) { for(const c of commands) db.prepare(c.sql).run(...c.values); }
/** Native rows and kit journal share a transaction. No Worker handlers or external effects run. */
export const lilyTargets: TargetAdapter = {
  read(db,destination,kind,id) {
    const stored=sqliteTargets.read(db,destination,kind,id);
    if (!stored) {
      if(kind!=='ticket_number_allocator')return undefined;
      const actual=findRow(db,kind,id);
      return actual ? { destination, targetKind:kind,targetId:id,value:{row:{...actual},generated:false},revision:sha256(canonicalJson(actual)) } : undefined;
    }
    const value:any=stored.value;
    const actual=findRow(db,kind,id);
    return { ...stored, value: { ...value, row: actual ?? null } };
  },
  write(db,row) {
    const value:any=row.value;
    statements(db,value.before);
    if(value.generated) {
      const actual=findRow(db,row.targetKind,row.targetId);
      if(canonicalJson(actual ?? null)!==canonicalJson(value.row)) throw new Error(`Generated native row mismatch: ${row.targetKind}`);
    } else {
      const existing=findRow(db,row.targetKind,row.targetId);
      if(existing) {
        if(row.targetKind!=='ticket_number_allocator')throw new Error('Unattributed native row collision');
        db.prepare(`UPDATE ${quote(row.targetKind)} SET ${Object.keys(value.row).map(c=>`${quote(c)}=?`).join(',')} WHERE ${keyColumns(db,row.targetKind).map(c=>`${quote(c)} IS ?`).join(' AND ')}`).run(...Object.values(value.row),...JSON.parse(row.targetId));
      } else insertRow(db,row.targetKind,value.row);
    }
    statements(db,value.after);
    sqliteTargets.write(db,row);
  },
  remove(db,destination,kind,id) {
    db.exec('PRAGMA defer_foreign_keys=ON');
    const stored=sqliteTargets.read(db,destination,kind,id);
    if(!stored) throw new Error('Missing native undo attribution');
    if(!(stored.value as any).generated || kind==='customer_addresses') db.prepare(`DELETE FROM ${quote(kind)} WHERE ${keyColumns(db,kind).map(c=>`${quote(c)} IS ?`).join(' AND ')}`).run(...JSON.parse(id));
    sqliteTargets.remove(db,destination,kind,id);
  },
  list(db,destination) { return sqliteTargets.list(db,destination).map(r=>this.read(db,destination,r.targetKind,r.targetId)!); },
};
/** Planning-only bridge to unchanged Lily planner. Captures its real compiler SQL. */
export function d1ReadBridge(db: SqlDatabase) {
  return { prepare(sql:string) {
    const make=(values:any[]=[])=>({sql,values,bind:(...bound:any[])=>make(bound),first:async()=>db.prepare(sql).get(...values)??null,all:async()=>({results:db.prepare(sql).all(...values)}),run:async()=>db.prepare(sql).run(...values)});
    return make();
  } };
}
export function snapshot(db: SqlDatabase): Record<string,any[]> {
  const result:Record<string,any[]>={};
  const virtual=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE 'CREATE VIRTUAL TABLE%'").all().map(r=>r.name);
  for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'ik_%' AND name NOT LIKE '%_fts%' AND name NOT IN ('d1_migrations','_cf_KV') ORDER BY name").all()) {
    if(virtual.some(prefix=>name===prefix||name.startsWith(prefix+'_')))continue;
    // FTS external content shadow tables have no declared primary key; their owning rows are reconciled separately.
    const columns=db.prepare(`PRAGMA table_info(${quote(name)})`).all();
    if(!columns.some(c=>c.pk)) continue;
    result[name]=db.prepare(`SELECT * FROM ${quote(name)}`).all().map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,ArrayBuffer.isView(v)?{base64:Buffer.from(v as Uint8Array).toString('base64')}:v]))).sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)));
  }
  return result;
}
