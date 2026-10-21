import type { FeatureContext } from '../../app/feature-context';
import type { AuthenticatedMember } from '../../app/types';
import { mutationGuard } from '../../app/operations';
import { currentSubject,requirePageLevel,requireContainerLevel } from '../sharing/current-access';
import { permitted } from '../search/visibility';
import { permittedNotificationEvidence,type NotificationDetail } from './visibility';
import type { OutboxRow } from './events';
export async function recipientContext(ctx:FeatureContext,memberId:string):Promise<FeatureContext|undefined>{const row=await ctx.db.prepare("SELECT m.id,m.workspace_id AS workspaceId,m.email,m.display_name AS displayName,m.role,w.name AS workspaceName FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=? AND m.workspace_id=? AND m.status='active'").bind(memberId,ctx.actor.workspaceId).first<Omit<AuthenticatedMember,'initials'>>();return row?{...ctx,actor:{...row,initials:row.displayName.slice(0,2)},authorizationEpoch:undefined}:undefined;}
export async function eventReadable(ctx:FeatureContext,row:Pick<OutboxRow,'page_id'|'container_id'|'detail_json'>&Partial<Pick<OutboxRow,'event'>>):Promise<boolean>{
 await currentSubject(ctx);
 if(row.page_id&&!await permitted(()=>requirePageLevel(ctx,row.page_id!,row.event==='access-requested'?'full':'view',{includeTrashed:row.event==='page-trashed'})))return false;
 if(row.container_id&&!await permitted(()=>requireContainerLevel(ctx,row.container_id!,'view')))return false;
 const detail=JSON.parse(row.detail_json) as NotificationDetail;if(!await permittedNotificationEvidence(ctx,row.event,detail))return false;for(const id of detail.sourcePageIds??[])if(!await permitted(()=>requirePageLevel(ctx,id,'view')))return false;
 return true;
}
export async function processNotificationOutbox(ctx:FeatureContext,limit=100):Promise<{processed:number}> {
 const rows=await ctx.db.prepare('SELECT * FROM notification_outbox WHERE workspace_id=? AND processed_at IS NULL ORDER BY created_at,id LIMIT ?').bind(ctx.actor.workspaceId,limit).all<OutboxRow>();let processed=0;
 for(const row of rows.results){const recipients=new Map<string,'direct'|'watched'>((JSON.parse(row.recipients_json) as string[]).map(id=>[id,'direct']));
  for(const id of JSON.parse(row.watched_recipients_json) as string[])if(!recipients.has(id))recipients.set(id,'watched');
  const statements:D1PreparedStatement[]=[];
  // The local owner can exercise Notify people by explicitly selecting themselves.
  // Ordinary self-generated events and all hosted delivery retain self suppression.
  const localSelfRecipient=ctx.localDevelopment===true&&row.event==='maintenance'&&(JSON.parse(row.recipients_json) as string[]).includes(row.actor_member_id??'');
  for(const [id,audience] of recipients){if(id===row.actor_member_id&&!localSelfRecipient)continue;const recipient=await recipientContext(ctx,id);if(!recipient||!await eventReadable(recipient,row))continue;
   statements.push(mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[recipient.authorizationEpoch!]),ctx.db.prepare('INSERT OR IGNORE INTO notifications(id,workspace_id,recipient_member_id,source_page_id,source_container_id,comment_id,event,detail_json,created_at,outbox_id,audience) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(`${row.id}:${id}`,row.workspace_id,id,row.page_id,row.container_id,row.comment_id,row.event,row.detail_json,row.created_at,row.id,audience));
  }
  // Durable independent chat intent. Delivery performs the destination audience checks again.
  const connections=await ctx.db.prepare("SELECT id,events_json FROM chat_connections WHERE workspace_id=? AND state='connected' AND (container_id IS NULL OR container_id=COALESCE(?,(SELECT container_id FROM pages WHERE id=?)))").bind(row.workspace_id,row.container_id,row.page_id).all<{id:string;events_json:string}>();
  for(const connection of connections.results)if((JSON.parse(connection.events_json) as string[]).includes(row.event))statements.push(ctx.db.prepare("INSERT OR IGNORE INTO chat_deliveries(id,connection_id,outbox_id,state,created_at) VALUES(?,?,?,'pending',?)").bind(row.event==='maintenance'?`${connection.id}:routine:${row.created_at.slice(0,10)}`:`${connection.id}:${row.id}`,connection.id,row.id,ctx.now));
  statements.push(ctx.db.prepare('UPDATE notification_outbox SET processed_at=? WHERE id=? AND processed_at IS NULL').bind(ctx.now,row.id));await ctx.db.batch(statements);processed++;
 }
 return {processed};
}
