import type {FeatureContext} from '../../../app/feature-context';
import type {BlockInput} from '../../pages/types';
import {mutationGuard} from '../../../app/operations';
import {ApiProblem} from '../../../app/problems';
import {syncedSource} from './read';
/** New references are checked before every public creation/replacement door, then fenced in its batch. */
export async function syncedGuards(ctx:FeatureContext,blocks:BlockInput[],old:BlockInput[]=[]){
 const statements:D1PreparedStatement[]=[];
 for(const block of blocks.filter(b=>b.blockType==='synced-reference')){
  const previous=old.find(b=>b.id===block.id&&b.blockType===block.blockType);
  if(previous&&JSON.stringify(previous.content)===JSON.stringify(block.content))continue;
  const c=block.content as {sourcePageId:string;sourceBlockId:string};
  const source=await syncedSource(ctx,c.sourcePageId,c.sourceBlockId);
  statements.push(mutationGuard(ctx.db,"SELECT p.revision_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL FROM page_blocks b JOIN pages p ON p.id=b.page_id WHERE b.id=? AND b.page_id=? AND b.block_type='synced-source'",[source.page.revision_id,c.sourceBlockId,c.sourcePageId]));
 }
 for(const source of old.filter(b=>b.blockType==='synced-source'&&!blocks.some(n=>n.id===b.id&&n.blockType==='synced-source'))){
  if(await ctx.db.prepare("SELECT 1 FROM page_revisions r,json_each(r.body_json) b WHERE r.deleted_at IS NULL AND json_extract(b.value,'$.blockType')='synced-reference' AND json_extract(b.value,'$.content.sourceBlockId')=? LIMIT 1").bind(source.id).first())throw new ApiProblem(409,'SYNCED_SOURCE_IN_USE','This synced source still has copies. Remove its copies or permanently delete its source page.');
  statements.push(mutationGuard(ctx.db,"SELECT NOT EXISTS(SELECT 1 FROM page_revisions r,json_each(r.body_json) b WHERE r.deleted_at IS NULL AND json_extract(b.value,'$.blockType')='synced-reference' AND json_extract(b.value,'$.content.sourceBlockId')=?)",[source.id]));
 }
 return statements;
}
