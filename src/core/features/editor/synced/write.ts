import {z} from 'zod';
import type {FeatureContext} from '../../../app/feature-context';
import {commitOperation,mutationGuard} from '../../../app/operations';
import {ApiProblem} from '../../../app/problems';
import {requirePageLevel} from '../../sharing/current-access';
import {pageBlocks,pageRow,pageGuard} from '../../pages/repository';
import {prepareReplaceBlocks} from '../service';
import {validateBlockContent} from '../validation';
const inputSchema=z.object({operationKey:z.string().min(1),expectedCopyRevisionId:z.string(),expectedSourceRevisionId:z.string(),text:z.array(z.unknown())}).strict();
export async function editSyncedCopy(ctx:FeatureContext,pageId:string,blockId:string,raw:unknown){
 const parsed=inputSchema.safeParse(raw);if(!parsed.success)throw new ApiProblem(400,'INVALID_SYNCED_EDIT','Supply the copy and source revisions and paragraph text.');const input=parsed.data;
 return commitOperation(ctx,{operationKey:input.operationKey,action:'pages.synced.update',request:{pageId,blockId,...input},authorize:async()=>{await requirePageLevel(ctx,pageId,'edit');},prepare:async({revisionId})=>{
  const destination=await pageRow(ctx,pageId),copy=(await pageBlocks(ctx.db,pageId)).find(b=>b.id===blockId&&b.blockType==='synced-reference');
  if(destination.locked_at||destination.archived_at||destination.trashed_at)throw new ApiProblem(409,'PAGE_UNAVAILABLE','This page cannot be edited.');
  if(!copy||copy.revisionId!==input.expectedCopyRevisionId)throw new ApiProblem(409,'BLOCK_CONFLICT','The synced copy changed. Reload it before editing.');
  const c=copy.content as {sourcePageId:string;sourceBlockId:string};await requirePageLevel(ctx,c.sourcePageId,'edit');
  const source=await pageRow(ctx,c.sourcePageId),blocks=await pageBlocks(ctx.db,source.id),block=blocks.find(b=>b.id===c.sourceBlockId&&b.blockType==='synced-source');
  if(!block||block.revisionId!==input.expectedSourceRevisionId)throw new ApiProblem(409,'BLOCK_CONFLICT','The synced source changed. Reload it before editing.');
  const content=validateBlockContent('synced-source',{text:input.text} as any);
  const plan=await prepareReplaceBlocks(ctx,source.id,{expectedRevisionId:source.revision_id,blocks:blocks.map(b=>b.id===block.id?{...b,content}:b)},revisionId);
  plan.statements.unshift(pageGuard(ctx,destination,destination.revision_id),mutationGuard(ctx.db,"SELECT revision_id=? AND block_type='synced-reference' AND json_extract(content_json,'$.sourcePageId')=? AND json_extract(content_json,'$.sourceBlockId')=? FROM page_blocks WHERE id=? AND page_id=?",[copy.revisionId,source.id,block.id,copy.id,pageId]));
  return plan;
 }});
}
