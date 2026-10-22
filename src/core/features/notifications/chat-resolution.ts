import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {managedChat} from './chat-config';
import {chatOwnerSql} from './chat-authority';

/** Owner acknowledgment records attention, never delivery or permission to send again. */
export function acknowledgeHeldChat(ctx:FeatureContext,input:{operationKey:string;id:string;deliveryId:string;expectedRevisionId:string}) {
 return commitOperation(ctx,{operationKey:input.operationKey,action:'chat.acknowledge',request:input,
  authorize:async()=>{await managedChat(ctx,input.id);},
  prepare:async({revisionId})=>{
   const connection=await managedChat(ctx,input.id);
   if(connection.revision_id!==input.expectedRevisionId)throw new ApiProblem(409,'REVISION_CONFLICT','Reload the destination before resolving a held send.');
   const row=await ctx.db.prepare('SELECT id,message_id,state,acknowledged_at FROM chat_deliveries WHERE id=? AND connection_id=?').bind(input.deliveryId,input.id).first<{id:string;message_id:string|null;state:string;acknowledged_at:string|null}>();
   if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
   if(row.state!=='uncertain')throw new ApiProblem(409,'CHAT_NOT_HELD','Only an uncertain send can be acknowledged.');
   const acknowledgedAt=row.acknowledged_at??ctx.now;
   return {
    statements:row.acknowledged_at?[]:[
     mutationGuard(ctx.db,`SELECT EXISTS(SELECT 1 FROM chat_connections c JOIN members m ON m.id=? AND m.workspace_id=c.workspace_id WHERE c.id=? AND c.workspace_id=? AND c.revision_id=? AND m.status='active' AND m.member_kind='member' AND ${chatOwnerSql})`,[ctx.actor.id,input.id,ctx.actor.workspaceId,input.expectedRevisionId,connection.container_id,connection.container_id]),
     mutationGuard(ctx.db,"SELECT state='uncertain' AND acknowledged_at IS NULL FROM chat_deliveries WHERE id=? AND connection_id=?",[row.id,input.id]),
     ctx.db.prepare("UPDATE chat_deliveries SET acknowledged_at=? WHERE connection_id=? AND (id=? OR message_id=?) AND state='uncertain'").bind(acknowledgedAt,input.id,row.id,row.message_id??row.id),
     ctx.db.prepare('INSERT INTO discovery_revisions VALUES(?,?,?,?,?,?,?)').bind(revisionId,ctx.actor.workspaceId,ctx.actor.id,'chat-delivery',row.id,JSON.stringify({acknowledged:true}),ctx.now),
    ],
    noChange:!!row.acknowledged_at,
    entity:{id:connection.id,kind:'chat-connection',revisionId:connection.revision_id},
    value:{id:row.id,state:'uncertain',acknowledgedAt},
   };
  },
 });
}
