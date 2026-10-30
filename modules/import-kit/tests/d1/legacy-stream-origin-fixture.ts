import { DatabaseSync } from '../../../container/adapters/d1-sqlite.mjs';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withFixtureEvidence } from './fixture-evidence.ts';
import { sqlitePort,sqliteTargets } from './sqlite-runtime.ts';
import { buildImportPlan } from '../../src/plan/index.ts';
import { d1Schema,d1ErasureSchema,canonicalJson,sha256 } from '../../src/d1/index.ts';

/** A real prior-schema database; the normal fixture already installs new DDL. */
export const legacyStreamOriginFixture=withFixtureEvidence(async(t:any)=>{
  const dir=mkdtempSync(join(tmpdir(),'kit-legacy-origin-')),file=join(dir,'data.sqlite');
  let native=new DatabaseSync(file),db=sqlitePort(native);
  t.after(()=>{native.close();rmSync(dir,{recursive:true,force:true});});
  native.exec('PRAGMA foreign_keys=ON');native.exec([...d1Schema,...d1ErasureSchema].join(';'));
  native.exec("CREATE TABLE native_records(destination TEXT,kind TEXT,id TEXT,revision TEXT,value_json TEXT,PRIMARY KEY(destination,kind,id));INSERT INTO native_records VALUES('workspace','record','unrelated','prior','{\"retained\":true}')");
  const context=()=>({destination:'workspace',namespace:'archive',mappingVersion:'v1',storage:{database:db,targets:sqliteTargets},authorization:{principalId:'owner',predicate:()=>({sql:'1'})}});
  const plan=buildImportPlan({artifacts:[],records:[],diagnostics:[]},{version:'v1',map:()=>({effects:[]})},context());
  // The ordinary operation resembles a parent key; real membership uses an
  // opaque operation key. Neither string is an origin-classification signal.
  for(const [id,operation] of [['ordinary','parent:0'],['child','opaque-member-operation']]){
    native.prepare("INSERT INTO ik_jobs(id,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,plan_json,state,total) VALUES(?,'workspace','archive','v1','owner',?,?,?,'queued',0)").run(id,plan.fingerprint,operation,canonicalJson(plan));
    native.prepare('INSERT INTO ik_original_sets VALUES(?,3)').run(id);
  }
  const layout=sha256(canonicalJson([{ordinal:0,job_id:'child',total:0}]));
  native.prepare("INSERT INTO ik_d1_streams VALUES('parent','workspace','archive','v1','owner',?,'parent-operation',0,?,'applying')").run(plan.fingerprint,layout);
  native.exec("INSERT INTO ik_d1_stream_pages(stream_id,ordinal,job_id,total) VALUES('parent',0,'child',0);UPDATE ik_d1_streams SET state='applying' WHERE id='parent'");
  return {native:()=>native,db:()=>db,context,plan,reopen(){native.close();native=new DatabaseSync(file);native.exec('PRAGMA foreign_keys=ON');db=sqlitePort(native);}};
});
