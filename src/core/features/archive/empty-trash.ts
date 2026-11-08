import type {FeatureContext} from '../../app/feature-context';
import {commitOperation, mutationGuard} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {currentSubject} from '../sharing/current-access';
import {descendants} from '../pages/tree';
import {treeTopologyGuard} from '../pages/tree-order';
import {beginImportErasure} from '../imports/retire-custody';
import {listArchive} from './list';
import {prepareErasePages} from './erasure';
import {completeErasure} from './erasure-cleanup';

/** A parent is eligible only when its complete live subtree can be destroyed. */
async function emptyTrashPages(ctx:FeatureContext) {
  const archive=await listArchive(ctx);
  const candidates=archive.items.filter(page=>page.trashedAt && page.permissions.canDelete);
  const allowed=new Set(candidates.map(page=>page.id));
  const selected=new Set<string>();
  for(const page of candidates) {
    const subtree=await descendants(ctx,page.id);
    if(subtree.every(child=>child.trashed_at && allowed.has(child.id)))
      for(const child of subtree)selected.add(child.id);
  }
  return candidates.filter(page=>selected.has(page.id)).sort((a,b)=>a.id.localeCompare(b.id));
}
export async function previewEmptyTrash(ctx:FeatureContext) {
  await currentSubject(ctx);
  return {items:(await emptyTrashPages(ctx)).map(page=>({id:page.id,title:page.title}))};
}
export async function emptyTrash(ctx:FeatureContext,input:{operationKey:string;confirmedPageIds:string[]}) {
  const erasure=beginImportErasure(ctx,input.operationKey);ctx=erasure.ctx;
  const result=await commitOperation(ctx,{
    commit:erasure.commit,operationKey:input.operationKey,action:'archive.empty-trash',request:input,
    authorize:async()=>{await currentSubject(ctx);},
    prepare:async({revisionId})=>{
      const pages=await emptyTrashPages(ctx),ids=pages.map(page=>page.id).sort();
      if(!Array.isArray(input.confirmedPageIds) || input.confirmedPageIds.some(id=>typeof id!=='string') ||
        JSON.stringify([...input.confirmedPageIds].sort())!==JSON.stringify(ids))
        throw new ApiProblem(409,'CONFIRM_CASCADE','Review and confirm every page to be destroyed.');
      if(!ids.length)throw new ApiProblem(409,'EMPTY_TRASH','There are no trashed page subtrees you can fully administer.');
      const statements:D1PreparedStatement[]=[];
      for(const page of pages) {
        statements.push(await treeTopologyGuard(ctx,page.id),mutationGuard(ctx.db,
          'SELECT deleted_at IS NULL AND trashed_at IS NOT NULL AND revision_id=? FROM pages WHERE id=? AND workspace_id=?',
          [page.revisionId,page.id,ctx.actor.workspaceId]));
      }
      statements.push(...await prepareErasePages(ctx,ids));
      return {statements,entity:{id:ctx.actor.workspaceId,kind:'workspace',revisionId},value:{deletedPageIds:ids}};
    },
  });
  await completeErasure(ctx);
  return result;
}
