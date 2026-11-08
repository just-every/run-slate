import type {FeatureContext} from '../../app/feature-context';
import type {RuntimeConfig} from '../../platform/config/runtime';
import {identityMailer} from '../../platform/mail';
import {mutationGuard} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {eventReadable,recipientContext} from './outbox';
import {visibleNotification,type NotificationRow} from './service';
import {changeSummary} from './change-summary';
import {unsubscribeDigest} from './unsubscribe';
import {digestPeriod} from './digest';
import type {OutboxRow} from './events';

export async function emailIntent(ctx:FeatureContext,row:OutboxRow,memberId:string):Promise<D1PreparedStatement[]>{
 const preference=await ctx.db.prepare('SELECT mode,revision_id,updated_at FROM notification_delivery_preferences WHERE member_id=? AND event=?').bind(memberId,row.event).first<{mode:'default'|'in-app'|'immediate'|'daily'|'weekly';revision_id:string;updated_at:string}>();
 if(!preference||preference.mode==='default'||preference.mode==='in-app'||preference.updated_at>row.created_at)return [];
 const stored=await ctx.db.prepare('SELECT value_json FROM discovery_preferences WHERE member_id=?').bind(memberId).first<{value_json:string}>();
 const timezone=stored?JSON.parse(stored.value_json).timezone??'UTC':'UTC';
 const period=digestPeriod(ctx.now>row.created_at?ctx.now:row.created_at,preference.mode,timezone,row.event);
 if(preference.mode==='immediate'&&row.event==='page-edited')period.dueAt=new Date(Date.parse(period.dueAt)+5*60000).toISOString();
 return [ctx.db.prepare('INSERT OR IGNORE INTO notification_email_items(notification_id,member_id,mode,preference_revision,due_at,bucket) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM notification_delivery_preferences WHERE member_id=? AND event=? AND revision_id=? AND mode=?)').bind(`${row.id}:${memberId}`,memberId,preference.mode,preference.revision_id,period.dueAt,period.bucket,memberId,row.event,preference.revision_id,preference.mode)];
}
interface EmailItem extends NotificationRow {notification_id:string;outbox_id:string;mode:'immediate'|'daily'|'weekly';bucket:string;preference_revision:string}
/** Current content is read only to render allowed metadata; no body enters the envelope or receipt. */
async function emailLine(ctx:FeatureContext,item:EmailItem,sectionNames:boolean,origin:string){
 const view=await visibleNotification(ctx,item);if(!view)return;
 if(item.event==='reminder'||item.event==='task-due'){
  const reminderId=(JSON.parse(item.detail_json) as {reminderId?:string}).reminderId;
  const active=reminderId&&await ctx.db.prepare('SELECT 1 FROM reminders WHERE id=? AND member_id=? AND cancelled_at IS NULL AND delivered_at IS NOT NULL').bind(reminderId,ctx.actor.id).first();
  if(!active)return;
 }
 const actor=await ctx.db.prepare('SELECT m.display_name FROM notification_outbox o JOIN members m ON m.id=o.actor_member_id WHERE o.id=?').bind(item.outbox_id).first<{display_name:string}>();
 const summary=await changeSummary(ctx,item.outbox_id,item.source_page_id,item.event,sectionNames);
 const clean=(text:string)=>text.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').trim();
 return `${clean(item.event.replaceAll('-',' '))} · ${clean(actor?.display_name??'Slate')} · ${clean(view.title??'Workspace')}${summary?` · ${clean(summary)}`:''} · ${new URL(view.href,origin).href}`;
}
export async function deliverNotificationEmail(ctx:FeatureContext,config:RuntimeConfig){
 if(!config.mailProvider||!config.mailFrom||!config.appUrl)return {sent:0};
 const rows=await ctx.db.prepare("SELECT DISTINCT i.member_id FROM notification_email_items i JOIN members m ON m.id=i.member_id WHERE m.workspace_id=? AND i.state='pending' AND i.due_at<=? ORDER BY i.member_id LIMIT 100").bind(ctx.actor.workspaceId,ctx.now).all<{member_id:string}>();let sent=0;
 for(const member of rows.results){
  const recipient=await recipientContext(ctx,member.member_id);
  if(!recipient){await ctx.db.prepare("UPDATE notification_email_items SET state='cancelled' WHERE member_id=? AND state='pending'").bind(member.member_id).run();continue;}
  // An immediate watched edit is one message for the completed editing session.
  // A later save extends its idle window without creating another email intent.
  await ctx.db.prepare(`UPDATE notification_email_items SET due_at=(SELECT strftime('%Y-%m-%dT%H:%M:%fZ',s.last_edit_at,'+5 minutes') FROM notifications n JOIN notification_outbox o ON o.id=n.outbox_id JOIN watch_edit_sessions s ON o.id='watch-edit:'||s.session_id WHERE n.id=notification_email_items.notification_id)
   WHERE member_id=? AND state='pending' AND mode='immediate' AND notification_id IN (SELECT n.id FROM notifications n JOIN notification_outbox o ON o.id=n.outbox_id JOIN watch_edit_sessions s ON o.id='watch-edit:'||s.session_id WHERE n.event='page-edited' AND strftime('%Y-%m-%dT%H:%M:%fZ',s.last_edit_at,'+5 minutes')>?)`).bind(member.member_id,ctx.now).run();
  const pending=(await ctx.db.prepare("SELECT n.*,i.notification_id,i.mode,i.bucket,i.preference_revision FROM notification_email_items i JOIN notifications n ON n.id=i.notification_id WHERE i.member_id=? AND i.state='pending' AND i.due_at<=? ORDER BY n.created_at,n.id").bind(member.member_id,ctx.now).all<EmailItem>()).results;
  const groups=new Map<string,EmailItem[]>();
  for(const item of pending){const key=item.mode==='immediate'?`notification:${item.notification_id}`:`digest:${member.member_id}:${item.mode}:${item.bucket}`;const group=groups.get(key)??[];group.push(item);groups.set(key,group);}
  for(const [id,items] of groups){
   // A durable reservation is never reclaimed automatically after an uncertain network write.
   const reserved=await ctx.db.prepare("INSERT OR IGNORE INTO notification_email_deliveries(id,member_id,workspace_id,state,created_at) VALUES(?,?,?,'sending',?) RETURNING id").bind(id,member.member_id,ctx.actor.workspaceId,ctx.now).first();
   if(!reserved)continue;
   try{
    await ctx.db.batch(items.map(item=>ctx.db.prepare("UPDATE notification_email_items SET delivery_id=? WHERE notification_id=? AND state='pending' AND delivery_id IS NULL").bind(id,item.notification_id)));
    const setting=await ctx.db.prepare('SELECT section_names FROM notification_email_settings WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{section_names:number}>();
    const accepted:EmailItem[]=[],lines:string[]=[];
    for(const item of items){
     const preference=await ctx.db.prepare('SELECT 1 FROM notification_delivery_preferences p JOIN notification_email_items i ON i.notification_id=? WHERE p.member_id=? AND p.event=? AND p.mode=? AND p.revision_id=? AND i.state=\'pending\' AND i.delivery_id=?').bind(item.notification_id,member.member_id,item.event,item.mode,item.preference_revision,id).first();
     if(!preference||!await eventReadable(recipient,{event:item.event,page_id:item.source_page_id,container_id:item.source_container_id,detail_json:item.detail_json}))continue;
     const line=await emailLine(recipient,item,!!setting?.section_names,config.appUrl);if(line){accepted.push(item);lines.push(line);}
    }
    if(!lines.length){await ctx.db.batch([ctx.db.prepare("UPDATE notification_email_deliveries SET state='cancelled' WHERE id=?").bind(id),ctx.db.prepare("UPDATE notification_email_items SET state='cancelled' WHERE delivery_id=?").bind(id)]);continue;}
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
    const unsubscribe=new URL('/api/notifications/unsubscribe',config.appUrl);unsubscribe.searchParams.set('token',token);
    await ctx.db.batch([mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[recipient.authorizationEpoch!]),ctx.db.prepare('INSERT INTO notification_unsubscribe_tokens(token_hash,member_id,workspace_id,events_json,created_at) VALUES(?,?,?,?,?)').bind(await unsubscribeDigest(token),member.member_id,ctx.actor.workspaceId,JSON.stringify([...new Set(accepted.map(item=>item.event))]),ctx.now)]);
    const result=await identityMailer(config,ctx.db,config.mailFrom).send({to:recipient.actor.email,subject:items[0]!.mode==='immediate'?'Slate notification':`Slate ${items[0]!.mode} digest · ${lines.length} items`,text:lines.map(line=>`- ${line}`).join('\n')+`\n\nUnsubscribe: ${unsubscribe.href}`,idempotencyKey:`slate-notification:${id}`,...(unsubscribe.protocol==='https:'?{unsubscribe:{url:unsubscribe.href,oneClick:true}}:{})});
    await ctx.db.batch([ctx.db.prepare("UPDATE notification_email_deliveries SET state='sent',sent_at=?,provider_message_id=? WHERE id=?").bind(ctx.now,result.id,id),ctx.db.prepare("UPDATE notification_email_items SET state='cancelled' WHERE delivery_id=?").bind(id),...accepted.map(item=>ctx.db.prepare("UPDATE notification_email_items SET state='sent' WHERE notification_id=? AND delivery_id=?").bind(item.notification_id,id))]);sent++;
   }catch(error){
    await ctx.db.batch([ctx.db.prepare("UPDATE notification_email_deliveries SET state=? WHERE id=?").bind(error instanceof ApiProblem?'cancelled':'held',id),ctx.db.prepare("UPDATE notification_email_items SET state=? WHERE delivery_id=? AND state='pending'").bind(error instanceof ApiProblem?'cancelled':'held',id)]);
   }
  }
 }
 return {sent};
}
