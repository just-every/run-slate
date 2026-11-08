import type {FeatureContext} from '../../app/feature-context';
import {commitOperation} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {requirePageLevel} from '../sharing/current-access';
import {pageRow,pageGuard,writable,contentEvent} from '../pages/repository';
import {contentPolicy} from '../pages/policy';
import {createUlid} from '../../shared/ulid';

/** Withdrawing publication preserves all content and history while closing every public exposure. */
export async function unpublishPage(ctx:FeatureContext,id:string,input:{operationKey:string;expectedRevisionId:string}){
 return commitOperation(ctx,{
  operationKey:input.operationKey,action:'pages.unpublish',request:{id,...input},
  authorize:async()=>{await requirePageLevel(ctx,id,'full');},
  prepare:async({revisionId})=>{
   const page=await pageRow(ctx,id);writable(page);
   if((await contentPolicy(ctx))['page.lifecycle.v1']!=='draft-then-publish')throw new ApiProblem(409,'POLICY_RESTRICTED','Unpublishing requires the draft and publish lifecycle.');
   const guards=[pageGuard(ctx,page,input.expectedRevisionId)];
   if(page.lifecycle==='draft'&&!page.published_revision_id)return {noChange:true,entity:{id,kind:'page',revisionId:page.revision_id},value:{pageId:id,revisionId:page.revision_id},statements:guards};
   return {entity:{id,kind:'page',revisionId},value:{pageId:id,revisionId},detail:{previousRevisionId:page.working_revision_id},statements:[...guards,
    ctx.db.prepare("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) SELECT ?,?,'member',?,'full',?,? WHERE NOT EXISTS(SELECT 1 FROM page_grants WHERE page_id=? AND principal_kind='member' AND principal_id=? AND level='full' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?))").bind(createUlid(),id,ctx.actor.id,ctx.now,ctx.now,id,ctx.actor.id,ctx.now),
    ctx.db.prepare("UPDATE pages SET lifecycle='draft',published_revision_id=NULL,revision_id=?,updated_at=? WHERE id=?").bind(revisionId,ctx.now,id),
    ctx.db.prepare('UPDATE public_exposures SET revoked_at=? WHERE page_id=? AND revoked_at IS NULL').bind(ctx.now,id),
    ctx.db.prepare("UPDATE content_schedules SET state='cancelled',updated_at=? WHERE page_id=? AND state IN ('scheduled','failed')").bind(ctx.now,id),
    ...contentEvent(ctx,id,revisionId,'unpublished'),
   ]};
  },
 });
}
