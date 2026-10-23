import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {currentSubject,requirePageLevel} from '../sharing/current-access';
import {readPage} from '../pages/service';
import {personalMutation} from '../navigation/mutations';
import {mutationGuard} from '../../app/operations';
import {reminderView,type ReminderRow} from './service';
export async function reminderJobs(ctx:FeatureContext){
 await currentSubject(ctx);
 const rows=(await ctx.db.prepare('SELECT * FROM reminders WHERE workspace_id=? AND member_id=? ORDER BY due_at,id').bind(ctx.actor.workspaceId,ctx.actor.id).all<ReminderRow>()).results;
 const items=[];
 for(const row of rows){
  let title='Unavailable page',href:string|null=null;
  try{await requirePageLevel(ctx,row.page_id,'view');const p=await readPage(ctx,row.page_id);title=p.page.title;href=`/app/pages/${row.page_id}`;}catch(e){if(!(e instanceof ApiProblem)||e.status!==404)throw e;}
  const stuck=!!row.attempt_started_at&&!row.delivered_at&&!row.cancelled_at&&!row.failure_code&&Date.parse(ctx.now)-Date.parse(row.attempt_started_at)>300000;
  const pending=row.delivered_at&&!row.cancelled_at&&await ctx.db.prepare("SELECT 1 FROM notification_outbox o WHERE o.id=? AND (o.processed_at IS NULL OR EXISTS(SELECT 1 FROM chat_deliveries d WHERE d.outbox_id=o.id AND d.state='pending'))").bind(`reminder:${row.id}:${row.revision_id}`).first();
  items.push({...reminderView(row),...(pending?{state:'queued-delivery'}:{}),title,href,stuck});
 }
 return {items};
}
export async function retryReminder(ctx:FeatureContext,id:string,input:{operationKey:string;expectedRevisionId:string}){
 return personalMutation(ctx,{operationKey:input.operationKey,action:'reminder.retry',request:{id,...input},authorize:async()=>{
  const r=await ctx.db.prepare('SELECT * FROM reminders WHERE id=? AND workspace_id=? AND member_id=?').bind(id,ctx.actor.workspaceId,ctx.actor.id).first<ReminderRow>();if(!r)throw new ApiProblem(404,'NOT_FOUND','Not found.');await requirePageLevel(ctx,r.page_id,'view');
 },build:async()=>({statements:[mutationGuard(ctx.db,'SELECT revision_id=? AND delivered_at IS NULL AND cancelled_at IS NULL FROM reminders WHERE id=? AND member_id=?',[input.expectedRevisionId,id,ctx.actor.id]),ctx.db.prepare('UPDATE reminders SET failure_code=NULL,attempt_started_at=NULL WHERE id=? AND member_id=?').bind(id,ctx.actor.id)],value:{id,retried:true}})});
}
