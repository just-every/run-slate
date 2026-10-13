import {retainedImportObjectKeys} from '../imports/storage-inventory';
import {zipSync,strToU8,unzipSync} from 'fflate';
import {ApiProblem} from '../../app/problems';
import {requestHash} from '../../app/operations';
import {portableTables,excludedTables} from './tables';
export type DataRow=Record<string,string|number|null>;
export interface WorkspaceArchive {version:1;createdAt:string;tables:Record<string,DataRow[]>;columns:Record<string,string[]>;blobs:{key:string;entry:string;hash:string;size:number}[];reconnect:string[]}
export const forbiddenColumns=/^(credential_ciphertext|token_digest|token_hash|client_secret|api_key|secret)$/;
export async function byteHash(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function schema(db:D1Database){const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name!='d1_migrations'").all<{name:string}>()).results.map(r=>r.name);for(const name of tables)if(!name.startsWith('rer_portability_')&&![...portableTables,...excludedTables].includes(name as never))throw new ApiProblem(409,'UNREGISTERED_PORTABLE_TABLE',`Register the ${name} table before exporting.`);const columns:Record<string,string[]>={};for(const name of portableTables){if(!tables.includes(name))continue;columns[name]=(await db.prepare(`PRAGMA table_info("${name}")`).all<{name:string}>()).results.map(r=>r.name);}return columns;}
export async function encodeArchive(manifest:WorkspaceArchive,blobs:Record<string,Uint8Array>){const json=JSON.stringify(manifest);return zipSync({...blobs,'manifest.json':strToU8(json),'integrity.json':strToU8(JSON.stringify({manifestHash:await requestHash(manifest)}))},{level:1});}
export async function decodeArchive(bytes:Uint8Array){
 if(bytes.length>256*1024*1024)throw new ApiProblem(413,'ARCHIVE_TOO_LARGE','Archive exceeds 256 MiB.');
 try{
  let expanded=0;
  const entries=unzipSync(bytes,{filter:file=>{expanded+=file.originalSize;if(expanded>512*1024*1024||file.originalSize>256*1024*1024)throw new ApiProblem(413,'ARCHIVE_TOO_LARGE','Expanded archive exceeds safety bounds.');return true;}});
  const manifest=JSON.parse(new TextDecoder().decode(entries['manifest.json'])) as WorkspaceArchive;
  const integrity=JSON.parse(new TextDecoder().decode(entries['integrity.json'])) as {manifestHash:string};
  if(manifest.version!==1||await requestHash(manifest)!==integrity.manifestHash||!manifest.tables||!manifest.columns||!Array.isArray(manifest.blobs)||!Array.isArray(manifest.reconnect))throw new Error('manifest');
  for(const rows of Object.values(manifest.tables))if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error('rows');
  const requiredKeys=retainedImportObjectKeys(manifest.tables);
  for(const row of manifest.tables.files??[])if(!row.deleted_at)requiredKeys.add(String(row.storage_key));
  for(const row of manifest.tables.federation_imports??[])if(row.state!=='deleted')requiredKeys.add(String(row.archive_key));
  const keys=new Set<string>(),names=new Set<string>();
  for(const blob of manifest.blobs){
   if(typeof blob.key!=='string'||typeof blob.entry!=='string'||!/^blobs\/\d+$/.test(blob.entry)||keys.has(blob.key)||names.has(blob.entry)||!requiredKeys.has(blob.key))throw new Error('blob identity');
   keys.add(blob.key);names.add(blob.entry);
   const data=entries[blob.entry];if(!data||data.length!==blob.size||await byteHash(data)!==blob.hash)throw new Error('blob');
  }
  for(const row of manifest.tables.files??[])if(!row.deleted_at&&!keys.has(String(row.storage_key)))throw new Error('missing file original');
  for(const row of manifest.tables.federation_imports??[])if(row.state!=='deleted'&&!keys.has(String(row.archive_key)))throw new Error('missing import original');
  for(const key of requiredKeys)if(!keys.has(key))throw new Error('missing import custody object');
  return {manifest,entries};
 }catch(error){if(error instanceof ApiProblem&&error.code==='ARCHIVE_TOO_LARGE')throw error;throw new ApiProblem(400,'CORRUPT_ARCHIVE','Archive manifest or file integrity is invalid.');}
}
