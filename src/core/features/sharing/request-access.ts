import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { mutationGuard,requestHash } from '../../app/operations';
import { personalMutation } from '../navigation/mutations';
import { notificationStatements } from '../notifications/events';
import { recipientContext } from '../notifications/outbox';
import { currentSubject,resolveCurrentAccess } from './current-access';

const dailyLimit=20;
async function canGrant(ctx:FeatureContext,pageId:string) {
  try {return (await resolveCurrentAccess(ctx,pageId)).decision.level==='full';}
  catch(error){if(error instanceof ApiProblem&&error.status===404)return false;throw error;}
}
/** The response is deliberately independent of record existence and grantor availability. */
export async function requestPageAccess(ctx:FeatureContext,pageId:string,input:{operationKey:string}) {
  if(!pageId||pageId.length>128)throw new ApiProblem(400,'INVALID_REQUEST','The request is invalid.');
  const day=ctx.now.slice(0,10),since=`${day}T00:00:00.000Z`;
  const countQuery="SELECT COUNT(*)<20 FROM discovery_revisions WHERE workspace_id=? AND member_id=? AND entity_kind='access-request' AND created_at>=?";
  await personalMutation(ctx,{operationKey:input.operationKey,action:'access-request.submit',request:{pageId,...input},authorize:async()=>{await currentSubject(ctx);},build:async()=>{
    const used=await ctx.db.prepare("SELECT COUNT(*) AS count FROM discovery_revisions WHERE workspace_id=? AND member_id=? AND entity_kind='access-request' AND created_at>=?").bind(ctx.actor.workspaceId,ctx.actor.id,since).first<{count:number}>();
    if((used?.count??0)>=dailyLimit)throw new ApiProblem(429,'ACCESS_REQUEST_LIMIT','The daily access request limit has been reached.');
    const statements=[mutationGuard(ctx.db,countQuery,[ctx.actor.workspaceId,ctx.actor.id,since])];
    const subject=await currentSubject(ctx);
    const page=await ctx.db.prepare("SELECT p.id,c.visibility,c.guest_access,w.guest_access AS workspace_guests FROM pages p JOIN containers c ON c.id=p.container_id AND c.workspace_id=p.workspace_id JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=? AND p.workspace_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND c.trashed_at IS NULL").bind(pageId,ctx.actor.workspaceId).first<{id:string;visibility:string;guest_access:string;workspace_guests:string}>();
    if(page&&page.visibility!=='personal'&&(!subject.isGuest||(page.guest_access!=='forbidden'&&page.workspace_guests!=='forbidden'))) {
      let readable=false;
      try {readable=(await resolveCurrentAccess(ctx,pageId)).decision.allowed;}catch(error){if(!(error instanceof ApiProblem&&error.status===404))throw error;}
      if(!readable) {
        const candidates=(await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND status='active' AND id!=? ORDER BY id").bind(ctx.actor.workspaceId,ctx.actor.id).all<{id:string}>()).results;
        for(const candidate of candidates) {
          const grantor=await recipientContext(ctx,candidate.id);
          if(!grantor||!await canGrant(grantor,pageId))continue;
          // One logical request per requester/page/UTC day, including distinct operation keys.
          const id=`access-request:${await requestHash({workspaceId:ctx.actor.workspaceId,requester:ctx.actor.id,pageId,day})}`;
          statements.push(...notificationStatements(ctx,{id,event:'access-requested',pageId,recipientIds:[candidate.id],detail:{requesterMemberId:ctx.actor.id}}));
          break;
        }
      }
    }
    return {statements,value:{accepted:true}};
  }});
  return {accepted:true};
}
