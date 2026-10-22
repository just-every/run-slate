import type {FeatureContext} from '../../../app/feature-context';
import {ApiProblem} from '../../../app/problems';
import {readPage} from '../../pages/service';
import {requireEnabled,openFolderCredential,readFolderConnection} from '../../imports/provider-folders/connections';
import type {FolderConnection} from '../../imports/provider-folders/types';
import {browseProviderFiles,providerFileMetadata} from './providers';
import {fileReferenceSchema,type FileCardState} from './reference';
async function recheck(ctx:FeatureContext,row:FolderConnection){
 ctx.authorizationEpoch=undefined;
 await requireEnabled(ctx,row.provider);
 const current=await readFolderConnection(ctx,row.id);
 if(current.state!=='connected'||current.revision_id!==row.revision_id||current.credential_ciphertext!==row.credential_ciphertext)throw new ApiProblem(403,'FILE_CONNECTION_CHANGED','Reconnect your provider account.');
}
export async function browseFiles(ctx:FeatureContext,connectionId:string,folder:string){
 const {row,token}=await openFolderCredential(ctx,connectionId);
 const result=await browseProviderFiles(row.provider,token,row.drive_id,folder);
 await recheck(ctx,row);return result;
}
export async function fileCard(ctx:FeatureContext,pageId:string,blockId:string):Promise<FileCardState>{
 const readReference=async()=>{
  ctx.authorizationEpoch=undefined;
  const document=await readPage(ctx,pageId),block=document.blocks.find(block=>block.id===blockId&&block.blockType==='file-card');
  if(!block)throw new ApiProblem(404,'NOT_FOUND','Not found.');
  return fileReferenceSchema.parse(block.content);
 };
 const reference=await readReference();
 const connection=await ctx.db.prepare("SELECT id FROM provider_folder_connections WHERE workspace_id=? AND member_id=? AND provider=? AND state='connected' ORDER BY updated_at DESC,id DESC LIMIT 1").bind(ctx.actor.workspaceId,ctx.actor.id,reference.provider).first<{id:string}>();
 if(!connection)return {state:'request-access',connect:true};
 try{
  const {row,token}=await openFolderCredential(ctx,connection.id);
  const metadata=await providerFileMetadata(reference,token);
  await recheck(ctx,row);
  if(JSON.stringify(await readReference())!==JSON.stringify(reference))throw new ApiProblem(409,'FILE_REFERENCE_CHANGED','The file reference changed. Refresh the page.');
  return {state:'readable',metadata};
 }catch(error){
  if(error instanceof ApiProblem&&error.status===403)return {state:'request-access',connect:false};
  if(error instanceof ApiProblem&&error.code==='SOURCE_DELETED')return {state:'unavailable'};
  if(error instanceof ApiProblem&&error.status===404)throw error;
  return {state:'failed'};
 }
}
