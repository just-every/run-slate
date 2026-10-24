import {detachOwnCopies} from './self';
import type {FeatureContext} from '../../../app/feature-context';
import type {BlockInput} from '../../pages/types';
import {mutationGuard} from '../../../app/operations';
import {ApiProblem} from '../../../app/problems';
import {detachSyncedSources} from './erase';
import {syncedSource} from './read';
/** New references are checked before every public creation/replacement door, then fenced in its batch. */
export async function syncedGuards(ctx:FeatureContext,blocks:BlockInput[],old:BlockInput[]=[],restoring=false){
 const statements:D1PreparedStatement[]=[];
 for(const block of blocks.filter(b=>b.blockType==='synced-reference')){
  const previous=old.find(b=>b.id===block.id&&b.blockType===block.blockType);
  if(previous&&JSON.stringify(previous.content)===JSON.stringify(block.content))continue;
  const c=block.content as {sourcePageId:string;sourceBlockId:string};
  if(restoring)continue;
  if((block.content as {staticId?:string}).staticId)throw new ApiProblem(400,'INVALID_SYNCED_REFERENCE','Retained copies can only be restored on their original page.');
  const source=await syncedSource(ctx,c.sourcePageId,c.sourceBlockId);
  statements.push(mutationGuard(ctx.db,"SELECT p.revision_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL FROM page_blocks b JOIN pages p ON p.id=b.page_id WHERE b.id=? AND b.page_id=? AND b.block_type='synced-source'",[source.page.revision_id,c.sourceBlockId,c.sourcePageId]));
 }
 const removed=old.filter(b=>b.blockType==='synced-source'&&!blocks.some(n=>n.id===b.id&&n.blockType==='synced-source'));
 if(removed.length){const rows=(await ctx.db.prepare('SELECT DISTINCT page_id FROM page_blocks WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(removed.map(b=>b.id))).all<{page_id:string}>()).results;for(const row of rows)await detachOwnCopies(ctx,row.page_id,blocks,removed);statements.push(...await detachSyncedSources(ctx,rows.map(r=>r.page_id),removed.map(b=>b.id)));}
 return statements;
}
