import type {FeatureContext} from '../../app/feature-context';
import {processNotificationOutbox} from './outbox';
/** The origin is already committed. Local inbox delivery is prompt; external writes
 * run in the queue. An enqueue/processing failure leaves durable pending rows for recovery. */
export async function dispatchCommittedNotifications(ctx:FeatureContext):Promise<void>{
 const pending=await ctx.db.prepare('SELECT 1 FROM notification_outbox WHERE workspace_id=? AND processed_at IS NULL LIMIT 1').bind(ctx.actor.workspaceId).first();
 if(!pending)return;
 try{await processNotificationOutbox(ctx);}catch(error){console.error('notification_outbox_prompt_delivery_failed',error);}
 try{await ctx.jobs.send({type:'discovery.deliver',workspaceId:ctx.actor.workspaceId});}catch(error){console.error('notification_outbox_enqueue_failed_recovery_pending',error);}
}
