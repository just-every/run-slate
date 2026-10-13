import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSqliteImportStorage } from '../../src/storage/sqlite.ts';
import { canonicalJson, sha256 } from '../../src/provenance/identity.ts';
import type { ImportContext, ImportMapping, SourceBundle, TargetAdapter } from '../../src/types.ts';
export function source(count=4): SourceBundle {
  const payloads=Array.from({length:count},(_,index)=>({text:'row '+index,index}));
  const bytes=canonicalJson(payloads),artifactHash=sha256(bytes);
  return {artifacts:[{name:'synthetic.json',sha256:artifactHash,size:Buffer.byteLength(bytes)}],diagnostics:[],records:payloads.map((payload,index)=>({namespace:'archive',kind:'item',sourceId:String(index),payload,payloadHash:sha256(canonicalJson(payload)),artifactHash,location:{artifact:'synthetic.json',row:index+1}}))};
}
export const mapping: ImportMapping={version:'v1',map:record=>({effects:[{targetKind:'item',targetId:record.sourceId,value:record.payload,attachment:{base64:Buffer.from('original '+record.sourceId).toString('base64'),sha256:sha256('original '+record.sourceId),mediaType:'text/plain'}}]})};
export function context(path:string,targets?:TargetAdapter): ImportContext {
  const storage=openSqliteImportStorage(path,{targets});
  storage.database.exec('CREATE TABLE IF NOT EXISTS test_authority (id TEXT PRIMARY KEY, permitted INTEGER NOT NULL)');
  storage.database.prepare('INSERT OR IGNORE INTO test_authority(id,permitted) VALUES(?,1)').run('owner');
  return {destination:'workspace',namespace:'archive',mappingVersion:'v1',storage,batchSize:1,authorization:{principalId:'owner',assertAuthorized(_action,_destination,db){if(!db.prepare('SELECT permitted FROM test_authority WHERE id=?').get('owner')?.permitted)throw new Error('NOT_AUTHORIZED');}}};
}
export function setup(t:any,targets?:TargetAdapter) {
  const directory=mkdtempSync(join(tmpdir(),'import-kit-')),path=join(directory,'data.sqlite'),ctx=context(path,targets);
  t.after(()=>{try{ctx.storage.close();}catch{}rmSync(directory,{recursive:true,force:true});});
  return {ctx,path,directory};
}
