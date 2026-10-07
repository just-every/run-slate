import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel } from '../sharing/current-access';
import { notificationStatements,type NotificationFact } from './events';
/** Automation may send a scoped inbox event as its real actor. It cannot manufacture access grants or attestations. */
export function sendNotification(ctx:FeatureContext,input:{operationKey:string;pageId:string;recipientIds:string[];outcome:string;channel?:'inbox'|'chat'}) {
 if(!Array.isArray(input.recipientIds)||!input.recipientIds.length||input.recipientIds.length>100||typeof input.outcome!=='string'||input.outcome.length>2000)throw new ApiProblem(400,'INVALID_NOTIFICATION','Supply bounded recipients and outcome.');
 return commitOperation(ctx,{operationKey:input.operationKey,action:'notification.send',request:input,authorize:async()=>{await requirePageLevel(ctx,input.pageId,'comment');if(input.channel==='chat'&&!await ctx.db.prepare("SELECT 1 FROM chat_connections WHERE workspace_id=? AND state='connected' AND EXISTS(SELECT 1 FROM json_each(events_json) WHERE value='maintenance')").bind(ctx.actor.workspaceId).first())throw new ApiProblem(503,'CHAT_NOT_CONFIGURED','Configure a chat destination for maintenance events before sending.');},prepare:async({revisionId})=>{const event:NotificationFact={id:revisionId,event:'maintenance',pageId:input.pageId,recipientIds:input.recipientIds,detail:{outcome:input.outcome}};return {statements:[...notificationStatements(ctx,event),ctx.db.prepare('INSERT INTO discovery_revisions VALUES(?,?,?,?,?,?,?)').bind(revisionId,ctx.actor.workspaceId,ctx.actor.id,'notification',ctx.actor.id,JSON.stringify(event),ctx.now)],entity:{id:ctx.actor.id,kind:'notification',revisionId},value:{id:revisionId,state:'queued'}};}});
}
