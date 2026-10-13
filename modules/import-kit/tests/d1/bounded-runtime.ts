import { sqliteRuntime } from './sqlite-runtime.ts';
import type { D1Sql,D1TargetAdapter } from '../../src/d1/index.ts';
const sql=(sql:string,...params:any[]):D1Sql=>({sql,params});
/** Real native tables and mutation receipts for configured transport tests. */
export async function boundedRuntime(t:any){
  const r=await sqliteRuntime(t);
  r.native().exec('CREATE TABLE bounded_native_clock(revision INTEGER NOT NULL,seal TEXT);INSERT INTO bounded_native_clock VALUES(0,NULL);CREATE TABLE bounded_native_fences(id TEXT PRIMARY KEY)');
  r.native().exec("CREATE TRIGGER bounded_receipt_update AFTER UPDATE OF revision ON bounded_native_clock BEGIN UPDATE bounded_native_clock SET seal=NULL;END;CREATE TRIGGER bounded_receipt_seal BEFORE UPDATE OF seal ON bounded_native_clock WHEN NEW.seal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bounded_native_fences WHERE id=NEW.seal) BEGIN SELECT RAISE(ABORT,'NATIVE_RECEIPT_CHANGED');END");
  for(const action of ['INSERT','UPDATE','DELETE'])r.native().exec(`CREATE TRIGGER bounded_native_${action} BEFORE ${action} ON native_records BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM bounded_native_fences) THEN RAISE(ABORT,'NATIVE_PUBLICATION_CHANGED') END;UPDATE bounded_native_clock SET revision=revision+1;END`);
  const targets:D1TargetAdapter={...r.context().storage.targets,
    async stagingRead(db,destination,kind,id){const epoch=await db.prepare('SELECT revision FROM bounded_native_clock').first();return {row:await this.read(db,destination,kind,id),guards:[sql('(SELECT revision FROM bounded_native_clock)=?',epoch!.revision)]};},
    stagingPublication(id){return {protect:[sql('INSERT INTO bounded_native_fences VALUES(?)',id)],seal:[sql('UPDATE bounded_native_clock SET seal=?',id)],release:[sql('DELETE FROM bounded_native_fences WHERE id=?',id)],final:[sql('EXISTS(SELECT 1 FROM bounded_native_clock WHERE seal=?)',id),sql('NOT EXISTS(SELECT 1 FROM bounded_native_fences)')]};},
  };
  return {...r,context:()=>({...r.context(),maxBatchBytes:2*1024*1024,storage:{database:r.db(),targets}})};
}
