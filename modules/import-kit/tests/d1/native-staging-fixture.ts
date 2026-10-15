import { sqliteRuntime, sqliteSource, sqliteMapping } from './sqlite-runtime.ts';
import { canonicalJson, sha256, retainedSql, planD1ImportStream, createD1ImportStream, type D1TargetAdapter, type D1Sql } from '../../src/d1/index.ts';
const query=(sql:string,...params:any[]):D1Sql=>({sql,params});
export const nativePrivateTables=['ik_d1_native_staging','ik_d1_native_staging_index','ik_d1_native_staging_values','ik_d1_publication_fences','native_publication_fence'];
export async function nativeStagingStorageFixture(t:any){
  const r=await sqliteRuntime(t);
  r.native().exec(`CREATE TABLE native_parts(target_id TEXT,ordinal INTEGER,body TEXT,PRIMARY KEY(target_id,ordinal)); CREATE TABLE native_clock(value INTEGER NOT NULL,seal TEXT);INSERT INTO native_clock VALUES(0,NULL);CREATE TABLE native_publication_fence(stage_id TEXT PRIMARY KEY);`);
  r.native().exec(`CREATE TRIGGER native_receipt_invalidate AFTER UPDATE OF value ON native_clock BEGIN UPDATE native_clock SET seal=NULL; END;CREATE TRIGGER native_receipt_guard BEFORE UPDATE OF seal ON native_clock WHEN NEW.seal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM native_publication_fence WHERE stage_id=NEW.seal) BEGIN SELECT RAISE(ABORT,'NATIVE_RECEIPT_CHANGED'); END`);
  for(const table of ['native_records','native_parts'])for(const event of ['INSERT','UPDATE','DELETE'])r.native().exec(`CREATE TRIGGER native_epoch_${table}_${event} BEFORE ${event} ON ${table} BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM native_publication_fence) THEN RAISE(ABORT,'NATIVE_PUBLICATION_CHANGED') END; UPDATE native_clock SET value=value+1; END`);
  const targets:D1TargetAdapter={
    planCodec:{id:'native-array-v1',encode:plan=>plan as any,decode:plan=>plan as any},
    async read(db,destination,kind,id){const row=await db.prepare('SELECT * FROM native_records WHERE destination=? AND kind=? AND id=?').bind(destination,kind,id).first();if(!row)return undefined;const parts=await db.prepare('SELECT body FROM native_parts WHERE target_id=? ORDER BY ordinal').bind(id).all();return {destination,targetKind:kind,targetId:id,revision:row.revision,value:{rows:parts.results.map(row=>JSON.parse(row.body))}};},
    async stagingRead(db,destination,kind,id){const epoch=await db.prepare('SELECT value FROM native_clock').first();return {row:await this.read(db,destination,kind,id),guards:[query('(SELECT value FROM native_clock)=?',epoch!.value)]};},
    stagingPublication(id){return {protect:[query('INSERT INTO native_publication_fence VALUES(?)',id)],seal:[query('UPDATE native_clock SET seal=?',id)],release:[query('DELETE FROM native_publication_fence WHERE stage_id=?',id)],final:[query('EXISTS(SELECT 1 FROM native_clock WHERE seal=?)',id),query('NOT EXISTS(SELECT 1 FROM native_publication_fence)')]};},
    matches(row,destination,kind,id){return row?query('EXISTS(SELECT 1 FROM native_records WHERE destination=? AND kind=? AND id=? AND revision=?)',destination,kind,id,row.revision):query('NOT EXISTS(SELECT 1 FROM native_records WHERE destination=? AND kind=? AND id=?) AND NOT EXISTS(SELECT 1 FROM native_parts WHERE target_id=?)',destination,kind,id,id);},
    matchesParts(row,destination,kind,id){const result=[this.matches(row,destination,kind,id)];if(row){const rows=(row.value as any).rows;result.push(query('(SELECT count(*) FROM native_parts WHERE target_id=?)=?',id,rows.length));for(const [ordinal,value] of rows.entries())result.push(retainedSql(['EXISTS(SELECT 1 FROM native_parts WHERE target_id=', ' AND ordinal=', ' AND body IS ', ')'],[id,ordinal,JSON.stringify(value)],[2]));}return result;},
    write(row){return [query("INSERT INTO native_records VALUES(?,?,?,?,'{}')",row.destination,row.targetKind,row.targetId,row.revision),...(row.value as any).rows.map((value:any,ordinal:number)=>retainedSql(['INSERT INTO native_parts(target_id,ordinal,body) VALUES(', ',', ',', ')'],[row.targetId,ordinal,JSON.stringify(value)],[2]))];},
    remove(destination,kind,id){return [query('DELETE FROM native_parts WHERE target_id=?',id),query('DELETE FROM native_records WHERE destination=? AND kind=? AND id=?',destination,kind,id)];},
    async list(db,destination){const rows=await db.prepare('SELECT kind,id FROM native_records WHERE destination=?').bind(destination).all();return Promise.all(rows.results.map(row=>this.read(db,destination,row.kind,row.id))) as any;},
    matchesCount(count,destination){return query('(SELECT count(*) FROM native_records WHERE destination=?)=?',destination,count);},
  };
  const context=()=>({...r.context(),maxBatchBytes:2*1024*1024,maxBatches:1,storage:{database:r.db(),targets}});
  return {...r,context,targets};
}
export async function nativeStagingFixture(t:any){
  const r=await nativeStagingStorageFixture(t),{context,targets}=r;
  const source=sqliteSource(1);source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  source.records[0].payload={rows:Array.from({length:20},(_,i)=>String(i)+'漢'.repeat(49000))};source.records[0].payloadHash=sha256(canonicalJson(source.records[0].payload));
  const plan=await planD1ImportStream(source,sqliteMapping,context());
  const job=await createD1ImportStream(plan,{...context(),reviewedFingerprint:plan.fingerprint});
  return {...r,context,targets,source,plan,job};
}
