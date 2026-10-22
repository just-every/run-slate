import {Zip,ZipDeflate,strToU8} from 'fflate';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requestHash} from '../../app/operations';
import {retainedImportObjectKeys} from '../imports/storage-inventory';
import {redactionCheckpoint} from './checkpoint';
import {schema,type WorkspaceArchive,type DataRow} from './archive';
import {safeRow} from './rows';
import {requireExportCoverage} from './coverage';
import {hex} from './stream-hash';
import {reconnect} from './jobs-store';
const partSize=5*1024*1024,maximum=256*1024*1024;
/** The owner ZIP format, spooled in bounded parts before any external upload. */
export async function writeWorkspaceArchive(ctx:FeatureContext,key:string,guard:()=>Promise<void>){
 await requireExportCoverage(ctx);
 const epoch=ctx.authorizationEpoch,columns=await schema(ctx.db),names=Object.keys(columns);
 const results=await ctx.db.batch(names.map(name=>ctx.db.prepare(`SELECT * FROM "${name}"`))),tables:Record<string,DataRow[]>={};
 for(const [i,name]of names.entries())tables[name]=(results[i]!.results as DataRow[]).map(row=>safeRow(name,row));
 const manifest:WorkspaceArchive={checkpoint:await redactionCheckpoint(ctx.db),version:1,createdAt:ctx.now,tables,columns,blobs:[],reconnect};
 const keys=retainedImportObjectKeys(tables);for(const row of tables.files??[])if(!row.deleted_at)keys.add(String(row.storage_key));for(const row of tables.federation_imports??[])if(row.state!=='deleted')keys.add(String(row.archive_key));
 const upload=await ctx.files.createMultipartUpload(key,{httpMetadata:{contentType:'application/zip'}}),parts:R2UploadedPart[]=[];
 const digest=new (crypto as Crypto & {DigestStream: typeof DigestStream}).DigestStream('SHA-256'),digestWriter=digest.getWriter();let pending:Uint8Array[]=[],pendingSize=0,total=0,originals=0;
 let archiveError:Error|undefined;
 const zip=new Zip((error,data)=>{if(error){archiveError=error;return;}pending.push(data);pendingSize+=data.length;total+=data.length;});
 async function current(){await guard();ctx.authorizationEpoch=undefined;await requireExportCoverage(ctx);if(ctx.authorizationEpoch!==epoch)throw new ApiProblem(409,'AUTHORITY_CHANGED','Workspace access changed during export.');}
 async function drain(final=false){
  if(archiveError)throw archiveError;if(total>maximum)throw new ApiProblem(413,'ARCHIVE_TOO_LARGE','Archive exceeds the bounded size.');
  while(pendingSize>=partSize||final&&pendingSize){const length=Math.min(partSize,pendingSize),bytes=new Uint8Array(length);let offset=0;
   while(offset<length){const first=pending[0]!,take=Math.min(first.length,length-offset);bytes.set(first.subarray(0,take),offset);offset+=take;if(take===first.length)pending.shift();else pending[0]=first.subarray(take);}pendingSize-=length;
   await current();await digestWriter.write(bytes);parts.push(await upload.uploadPart(parts.length+1,bytes));
  }
 }
 async function addBytes(name:string,bytes:Uint8Array){const entry=new ZipDeflate(name,{level:1});zip.add(entry);for(let at=0;at<bytes.length;at+=65536){entry.push(bytes.subarray(at,at+65536));await drain();}entry.push(new Uint8Array(),true);await drain();}
 try{
  for(const storageKey of keys){await current();const object=await ctx.files.get(storageKey);if(!object)throw new ApiProblem(409,'MISSING_EXPORT_FILE','A referenced original file is missing.');
   const name=`blobs/${manifest.blobs.length}`,entry=new ZipDeflate(name,{level:1});zip.add(entry);
   const fileDigest=new (crypto as Crypto & {DigestStream: typeof DigestStream}).DigestStream('SHA-256'),fileWriter=fileDigest.getWriter(),reader=object.body.getReader();let size=0;
   try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;originals+=item.value.length;if(originals>maximum)throw new ApiProblem(413,'ARCHIVE_TOO_LARGE','Export exceeds the bounded original-file size.');
     for(let at=0;at<item.value.length;at+=65536){const bytes=item.value.subarray(at,at+65536);await fileWriter.write(bytes);entry.push(bytes);await drain();}}
    await fileWriter.close();entry.push(new Uint8Array(),true);await drain();manifest.blobs.push({key:storageKey,entry:name,hash:hex(await fileDigest.digest),size});
   }catch(error){await reader.cancel().catch(()=>{});await fileWriter.abort().catch(()=>{});throw error;}finally{reader.releaseLock();}
  }
  await current();await addBytes('manifest.json',strToU8(JSON.stringify(manifest)));await addBytes('integrity.json',strToU8(JSON.stringify({manifestHash:await requestHash(manifest)})));zip.end();await drain(true);await digestWriter.close();await current();await upload.complete(parts);
  return {size:total,sha256:hex(await digest.digest),counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length]))};
 }catch(error){zip.terminate();await digestWriter.abort().catch(()=>{});await upload.abort().catch(()=>{});throw error;}
}
