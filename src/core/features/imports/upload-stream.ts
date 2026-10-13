import {createHash} from 'node:crypto';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,requestHash} from '../../app/operations';
import {currentSubject,requirePageLevel} from '../sharing/current-access';
import {identityRevision} from '../workspace/revisions';
import {createUlid} from '../../shared/ulid';
import {importSafetyLimits} from './safety';
import type {ImportFormat} from './types';
export interface ImportUploadMetadata {operationKey:string;format:ImportFormat;name:string;mediaType?:string;sizeBytes:number;destination?:{pageId:string;expectedRevisionId:string;mode:'append'|'children'}}
/** Raw request streaming avoids constructing multipart and archive-sized byte
 * buffers. Actual byte count and digest are verified before job admission. */
export async function startStreamImport(ctx:FeatureContext,input:ImportUploadMetadata,body:ReadableStream<Uint8Array>) {
 await currentSubject(ctx);if(input.destination)await requirePageLevel(ctx,input.destination.pageId,'edit');
 if(input.sizeBytes>importSafetyLimits().maximumArchiveBytes)throw new ApiProblem(413,'FILE_TOO_LARGE','Archive limit is 256 MiB.');
 const id=createUlid(),key=`federation/imports/${id}/original`,digest=createHash('sha256');let size=0;
 const checked=body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.length;if(size>input.sizeBytes)throw new ApiProblem(400,'IMPORT_SIZE_MISMATCH','The uploaded file length changed.');digest.update(chunk);controller.enqueue(chunk);},flush(){if(size!==input.sizeBytes)throw new ApiProblem(400,'IMPORT_SIZE_MISMATCH','The uploaded file is incomplete.');}}));
 try {
  const fixed=new FixedLengthStream(input.sizeBytes),transfer=new AbortController();
  const writes=await Promise.allSettled([checked.pipeTo(fixed.writable,{signal:transfer.signal}),ctx.files.put(key,fixed.readable,{httpMetadata:{contentType:input.mediaType??'application/octet-stream'}}).catch(error=>{transfer.abort(error);throw error;})]);
  // Both sides have settled before deleting a failed upload, so a late put
  // cannot recreate an untracked original after cleanup.
  for(const result of writes)if(result.status==='rejected')throw result.reason;
  const hash=await requestHash({format:input.format,name:input.name,destination:input.destination,bytes:Array.from(digest.digest())});
  const prior=await ctx.db.prepare('SELECT id,request_hash,state FROM federation_imports WHERE workspace_id=? AND actor_id=? AND operation_key=?').bind(ctx.actor.workspaceId,ctx.actor.id,input.operationKey).first<{id:string;request_hash:string;state:string}>();
  if(prior){await ctx.files.delete(key);if(prior.request_hash!==hash)throw new ApiProblem(409,'OPERATION_KEY_CONFLICT','The operation key names a different archive.');return {id:prior.id,state:prior.state};}
  const result=(await commitOperation(ctx,{operationKey:input.operationKey,action:'imports.stage',request:{hash},authorize:async()=>{await currentSubject(ctx);if(input.destination)await requirePageLevel(ctx,input.destination.pageId,'edit');},prepare:async({revisionId})=>({entity:{id,kind:'import',revisionId},value:{id,state:'queued'},statements:[await identityRevision(ctx,revisionId,'import',id,{format:input.format,name:input.name,state:'queued',hash}),ctx.db.prepare("INSERT INTO federation_imports (id,workspace_id,actor_id,operation_key,request_hash,archive_key,format,filename,state,report_json,revision_id,created_at,updated_at,destination_page_id,expected_page_revision_id,destination_mode) VALUES (?,?,?,?,?,?,?,?,'queued',?,?,?,?,?,?,?)").bind(id,ctx.actor.workspaceId,ctx.actor.id,input.operationKey,hash,key,input.format,input.name,'{}',revisionId,ctx.now,ctx.now,input.destination?.pageId??null,input.destination?.expectedRevisionId??null,input.destination?.mode??null)]})})).value;
  if(result.id!==id)await ctx.files.delete(key);
  return result;
 }catch(error){await ctx.files.delete(key);throw error;}
}
