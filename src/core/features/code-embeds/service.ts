import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {readPage} from '../pages/service';
import {codeReference,type CodeCardState} from './reference';
import {codeMetadata} from './providers';
import {CodeProviderError} from './http';
import {codeMember,openCode,recheckCode,type CodeConnection} from './connections';
export async function codeCard(ctx:FeatureContext,pageId:string,blockId:string):Promise<CodeCardState>{
 const reference=async()=>{
  ctx.authorizationEpoch=undefined;const doc=await readPage(ctx,pageId),block=doc.blocks.find(b=>b.id===blockId&&b.blockType==='link-card');
  const ref=block?codeReference((block.content as {url:string}).url):null;
  if(!ref)throw new ApiProblem(404,'NOT_FOUND','Not found.');return ref;
 };
 const ref=await reference();
 try{
  await codeMember(ctx);
  const row=await ctx.db.prepare("SELECT * FROM code_embed_connections WHERE workspace_id=? AND member_id=? AND provider=? AND state='connected'").bind(ctx.actor.workspaceId,ctx.actor.id,ref.provider).first<CodeConnection>();
  if(!row)return {state:'connect'};
  const token=await openCode(ctx,row),metadata=await codeMetadata(ref,token);
  await recheckCode(ctx,row,token);
  if(JSON.stringify(await reference())!==JSON.stringify(ref))throw new ApiProblem(409,'CODE_REFERENCE_CHANGED','Refresh this page.');
  return {state:'readable',reference:ref,metadata};
 }catch(error){
  if(error instanceof CodeProviderError)return {state:error.state};
  if(error instanceof ApiProblem&&error.status===404)throw error;
  if(error instanceof ApiProblem&&error.status===403)return {state:'request-access'};
  return {state:'failed'};
 }
}
