import type {FeatureContext} from '../../../app/feature-context';
import {readPage} from '../../pages/service';
import {ApiProblem} from '../../../app/problems';
import {providerEmbed} from './providers';
import {checkEmbed} from './refusal';
export async function embedStatus(ctx:FeatureContext,pageId:string,blockId:string,origin:string){
  const read=async()=>{ctx.authorizationEpoch=undefined;const doc=await readPage(ctx,pageId);const block=doc.blocks.find(b=>b.id===blockId&&b.blockType==='link-card');const content=block?.content as {url?:string}|undefined;if(!content?.url||!providerEmbed(content.url))throw new ApiProblem(404,'NOT_FOUND','No supported embed is available.');return content.url;};
  const url=await read(),result=await checkEmbed(origin,url);
  if(await read()!==url)throw new ApiProblem(409,'EMBED_CHANGED','Refresh this page.');
  return result;
}
