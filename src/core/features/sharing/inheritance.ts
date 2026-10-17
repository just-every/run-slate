import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { requirePageLevel } from './current-access';
import { pageRow,pageGuard,snapshot,revisionStatement,contentEvent,writable } from '../pages/repository';
/** Restriction changes traversal only; neither branch copies nor rewrites any grant. */
export function setPageInheritance(ctx:FeatureContext,pageId:string,input:{operationKey:string;expectedRevisionId:string;restricted:boolean}) {
  return commitOperation(ctx,{operationKey:input.operationKey,action:'sharing.inheritance',request:{pageId,...input},authorize:async()=>{await requirePageLevel(ctx,pageId,'full');},prepare:async({revisionId})=>{
    const page=await pageRow(ctx,pageId);writable(page);
    const inheritance=input.restricted?'restricted':'inherit';
    if(page.access_inheritance===inheritance)return {noChange:true,entity:{id:pageId,kind:'page',revisionId:page.revision_id},value:{pageId,revisionId:page.revision_id,restricted:input.restricted},statements:[pageGuard(ctx,page,input.expectedRevisionId)]};
    return {entity:{id:pageId,kind:'page',revisionId},value:{pageId,revisionId,restricted:input.restricted},statements:[
      pageGuard(ctx,page,input.expectedRevisionId),ctx.db.prepare('UPDATE pages SET access_inheritance=?,revision_id=?,updated_at=? WHERE id=?').bind(inheritance,revisionId,ctx.now,pageId),
      await revisionStatement(ctx,pageId,revisionId,await snapshot(ctx,page)),...contentEvent(ctx,pageId,revisionId,'access-inheritance',{restricted:input.restricted})
    ]};
  }});
}
