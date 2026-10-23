import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import {recipientContext} from '../notifications/outbox';
import {notificationStatements} from '../notifications/events';
import {readPage} from '../pages/service';
import type {ReminderRow} from './service';
/** The outbox fact and delivered marker commit together; concurrent cron runs share the same event identity. */
export async function dispatchDueReminders(ctx:FeatureContext){
 const rows=await ctx.db.prepare('SELECT * FROM reminders WHERE workspace_id=? AND due_at<=? AND delivered_at IS NULL AND cancelled_at IS NULL AND failure_code IS NULL ORDER BY due_at,id LIMIT 100').bind(ctx.actor.workspaceId,ctx.now).all<ReminderRow>();let delivered=0;
 for(const row of rows.results){
  await ctx.db.prepare('UPDATE reminders SET attempt_started_at=? WHERE id=? AND revision_id=? AND delivered_at IS NULL AND cancelled_at IS NULL AND failure_code IS NULL').bind(ctx.now,row.id,row.revision_id).run();
  try {const recipient=await recipientContext(ctx,row.member_id);let available=!!recipient;
  if(recipient)try{const doc=await readPage(recipient,row.page_id),block=row.block_id?doc.blocks.find(b=>b.id===row.block_id):undefined;if(row.block_id&&!block)available=false;if(row.kind==='task-due'){const task=block?.blockType==='task'?block.content as Record<string,any>:undefined;if(!task||task.done||task.assigneeMemberId!==row.member_id||task.dueDate!==row.date)available=false;}}catch(e){if(!(e instanceof ApiProblem)||e.status!==404)throw e;available=false;}
  if(!available){await ctx.db.prepare('UPDATE reminders SET cancelled_at=COALESCE(cancelled_at,?) WHERE id=? AND revision_id=? AND delivered_at IS NULL').bind(ctx.now,row.id,row.revision_id).run();continue;}
  try{await ctx.db.batch([mutationGuard(ctx.db,'SELECT revision_id=? AND cancelled_at IS NULL AND failure_code IS NULL AND delivered_at IS NULL FROM reminders WHERE id=?',[row.revision_id,row.id]),mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[recipient!.authorizationEpoch!]),...notificationStatements(ctx,{id:`reminder:${row.id}:${row.revision_id}`,event:row.kind==='task-due'?'task-due':'reminder',actorId:null,pageId:row.page_id,recipientIds:[row.member_id],detail:{reminderId:row.id,...(row.block_id?{blockId:row.block_id}:{})}}),ctx.db.prepare('UPDATE reminders SET failure_code=NULL,delivered_at=COALESCE(delivered_at,?) WHERE id=? AND revision_id=? AND cancelled_at IS NULL').bind(ctx.now,row.id,row.revision_id)]);delivered++;}catch(error){/* Another cron, cancellation, edit or ACL change won the guarded batch. Pending rows remain for the next tick. */if(!String(error).includes('core_write_guards')&&!String(error).includes('CHECK constraint'))throw error;}
  }catch(error){await ctx.db.prepare("UPDATE reminders SET failure_code='DELIVERY_FAILED' WHERE id=? AND revision_id=? AND delivered_at IS NULL AND cancelled_at IS NULL").bind(row.id,row.revision_id).run();}
 }
 return {delivered};
}
