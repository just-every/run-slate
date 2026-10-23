import type {FeatureContext} from '../../../app/feature-context';
import type {BlockView,SyncedResolution} from '../../../shared/api/content';
import {ApiProblem} from '../../../app/problems';
import {requirePageLevel} from '../../sharing/current-access';
import {pageRow,revisionRow} from '../../pages/repository';
import {labelForReader} from '../../pages/mentions';
import {publicPage,publicTargets} from '../../publishing/service';
import {labelPageMentions} from '../../pages/mention-labels';
export async function syncedSource(ctx:FeatureContext,pageId:string,blockId:string){
 const access=await requirePageLevel(ctx,pageId,'view'),page=await pageRow(ctx,pageId);
 if(page.trashed_at)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 const editor=['edit','full'].includes(access.decision.level??'');
 const snapshot=await revisionRow(ctx,pageId,editor?page.working_revision_id:page.published_revision_id??page.working_revision_id);
 const block=(JSON.parse(snapshot.body_json) as BlockView[]).find(b=>b.id===blockId&&b.blockType==='synced-source');
 if(!block)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 const content=await labelForReader(ctx,block.content) as {text:unknown[]};
 return {page,block,resolution:{state:'ready',text:content.text,sourceTitle:JSON.parse(snapshot.properties_json).title,sourcePageId:pageId,sourceBlockId:blockId,sourceRevisionId:block.revisionId,canEdit:editor&&!page.archived_at&&!page.locked_at} satisfies SyncedResolution};
}
export async function projectSynced(ctx:FeatureContext,blocks:BlockView[]):Promise<BlockView[]>{
 return Promise.all(blocks.map(async block=>{
  if(block.blockType!=='synced-reference')return block;
  const c=block.content as {sourcePageId:string;sourceBlockId:string};
  let synced:SyncedResolution;
  try{synced=(await syncedSource(ctx,c.sourcePageId,c.sourceBlockId)).resolution;}
  catch(error){if(!(error instanceof ApiProblem)||error.status!==404)throw error;synced={state:'access-needed'};}
  return {...block,synced};
 }));
}
export async function projectPublicSynced(db:D1Database,exposure:Record<string,any>,blocks:BlockView[]):Promise<BlockView[]>{
 return Promise.all(blocks.map(async block=>{
  if(block.blockType!=='synced-reference')return block;
  const c=block.content as {sourcePageId:string;sourceBlockId:string};
  const row=await db.prepare('SELECT host,slug FROM public_exposures WHERE page_id=? AND revoked_at IS NULL').bind(c.sourcePageId).first<{host:string;slug:string}>();
  let synced:SyncedResolution={state:'access-needed'};
  if(row)try{
   const source=await publicPage(db,row.host,row.slug);
   if(source.workspace_id===exposure.workspace_id&&source.anonymous_access==='allowed'&&source.workspace_anonymous==='allowed'){
    const target=(JSON.parse(source.body_json) as BlockView[]).find(b=>b.id===c.sourceBlockId&&b.blockType==='synced-source');
    if(target){const {titles}=await publicTargets(db,{...source,body_json:JSON.stringify([target])});const content=labelPageMentions(target.content,id=>titles[id]??'Restricted page') as {text:unknown[]};synced={state:'ready',text:content.text,sourceTitle:JSON.parse(source.properties_json).title,canEdit:false};}
   }
  }catch(error){if(!(error instanceof ApiProblem)||error.status!==404)throw error;}
  return {...block,synced};
 }));
}
/** Readable copies are independent paragraphs, with no source identifiers or retained sync permission. */
export function materializeSynced(blocks:BlockView[],sourceTitle?:string):BlockView[]{return blocks.map(block=>{
 const {synced,...plain}=block;
 if(block.blockType==='synced-source')return {...plain,blockType:'paragraph',content:sourceTitle?{text:[...((block.content as any).text),{text:`\nSource: ${sourceTitle}`}]}:block.content};
 if(block.blockType!=='synced-reference')return plain;
 const text=synced?.state==='ready'?[...(synced.text??[]),{text:`\nSource: ${synced.sourceTitle}`}]:[{text:'Access needed'}];
 return {...plain,blockType:'paragraph',content:{text} as BlockView['content']};
});}
