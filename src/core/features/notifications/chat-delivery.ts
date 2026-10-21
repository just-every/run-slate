import { chatMessage } from './chat-message';
import {chatCredential,type ChatCredentialRow} from './chat-credential';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import {requireChatOwner,chatOwnerSql} from './chat-authority';
import {chatNotifier,type ChatProvider} from './chat-provider';
import {managedChat} from './chat-config';
import { permitted } from '../search/visibility';
import { requestHash } from '../../app/operations';
import { eventReadable,recipientContext } from './outbox';
import type { OutboxRow } from './events';
import { mappedAudience,type ChatConfig } from './chat-config';
import { ChatProviderError } from './slack';
interface Delivery {id:string;connection_id:string;outbox_id:string;state:string;attempts:number;first_attempt_at:string|null;created_at:string}
interface Connection extends ChatCredentialRow {id:string;provider:ChatProvider;container_id:string|null;destination:string;credential_ciphertext:string|null;state:string;revision_id:string;connected_by_member_id:string;events_json:string}
async function stop(ctx:FeatureContext,row:Delivery,reason:string,state='cancelled'){await ctx.db.prepare('UPDATE chat_deliveries SET state=?,failure=? WHERE id=?').bind(state,reason,row.id).run();}
export async function deliverChat(ctx:FeatureContext,config:ChatConfig):Promise<{processed:number}> {
 const connected=await ctx.db.prepare("SELECT 1 FROM chat_connections WHERE workspace_id=? AND state='connected'").bind(ctx.actor.workspaceId).first();
 if(connected&&!config.credentialKey)throw new ApiProblem(503,'CREDENTIAL_KEY_REQUIRED','CONNECTOR_CREDENTIALS_KEY is required for the connected chat destination.');
 const deliveries=await ctx.db.prepare("SELECT d.* FROM chat_deliveries d JOIN chat_connections c ON c.id=d.connection_id JOIN notification_outbox e ON e.id=d.outbox_id WHERE c.workspace_id=? AND d.state='pending' AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=?) AND (e.event<>'maintenance' OR substr(e.created_at,1,10)<substr(?,1,10)) ORDER BY d.created_at,d.id LIMIT 100").bind(ctx.actor.workspaceId,ctx.now,ctx.now).all<Delivery>();let processed=0;
 for(const row of deliveries.results){
  const connection=await ctx.db.prepare('SELECT * FROM chat_connections WHERE id=?').bind(row.connection_id).first<Connection>();
  let event=await ctx.db.prepare('SELECT * FROM notification_outbox WHERE id=?').bind(row.outbox_id).first<OutboxRow>();
  if(!connection||connection.state!=='connected'||(!connection.credential_ciphertext&&!connection.source_connection_id)||!event||!(JSON.parse(connection.events_json) as string[]).includes(event.event)){await stop(ctx,row,'connection_unavailable');continue;}
  const owner=await recipientContext(ctx,connection.connected_by_member_id);if(!owner||!await permitted(()=>requireChatOwner(owner,connection.container_id))){await stop(ctx,row,'connection_owner_authority_revoked');await ctx.db.prepare("UPDATE chat_connections SET state='needs-attention',needs_attention_reason='connection_owner_authority_revoked',last_failed_at=?,last_failure_reason='connection_owner_authority_revoked' WHERE id=?").bind(ctx.now,connection.id).run();continue;}
  let dispatched=false;
  try{
   const token=await chatCredential(owner,connection,config.credentialKey!);const adapter=config.adapter??chatNotifier(connection.provider);const channel=connection.destination.slice(connection.provider.length+1);
   const audience=await adapter.audience(token,channel);const ids=await mappedAudience(ctx,audience.emails);
   if(!ids.length){await stop(ctx,row,'empty_audience');continue;}
   const events=event.event==='maintenance'?(await ctx.db.prepare("SELECT * FROM notification_outbox WHERE workspace_id=? AND event='maintenance' AND substr(created_at,1,10)=? ORDER BY created_at,id").bind(ctx.actor.workspaceId,event.created_at.slice(0,10)).all<OutboxRow>()).results:[event];
   let deliverable:OutboxRow[]=[];for(const candidate of events){if(connection.container_id){const scope=candidate.page_id?await ctx.db.prepare('SELECT container_id FROM pages WHERE id=?').bind(candidate.page_id).first<string>('container_id'):candidate.container_id;if(scope!==connection.container_id)continue;}let readable=true;for(const id of ids){const reader=await recipientContext(ctx,id);if(!reader||!await eventReadable(reader,candidate)){readable=false;break;}}if(readable)deliverable.push(candidate);}
   if(!deliverable.length){await stop(ctx,row,'audience_access_revoked');continue;}event=deliverable[0];let denied=false;
   if(!config.appUrl)throw new ApiProblem(503,'APP_URL_REQUIRED','APP_URL is required for chat notification links.');
   const text=await chatMessage(ctx,deliverable,config.appUrl);
   // Last atomic claim checks connection revision and all current ACL changes. A disconnect/revoke wins before dispatch.
   const epoch=await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>();
   // Recheck after provider membership request and title reads, immediately before claim.
   for(const candidate of deliverable)for(const id of ids){const reader=await recipientContext(ctx,id);if(!reader||!await eventReadable(reader,candidate)){denied=true;break;}}
   if(denied){await stop(ctx,row,'audience_access_revoked');continue;}
   const hash=await requestHash(row.id);const key=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
   const sourceCondition=connection.source_connection_id?" AND EXISTS(SELECT 1 FROM federation_connections WHERE id=? AND revision_id=? AND state='connected' AND credential_ciphertext IS NOT NULL AND member_id=?)":'';
   const claim=await ctx.db.prepare("UPDATE chat_deliveries SET state='dispatching',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM chat_connections WHERE id=? AND state='connected' AND revision_id=?) AND EXISTS(SELECT 1 FROM members m WHERE m.id=? AND m.workspace_id=? AND m.member_kind='member' AND m.status='active' AND "+chatOwnerSql+") AND (? IS NULL OR ?=COALESCE((SELECT container_id FROM pages WHERE id=?),?)) AND EXISTS(SELECT 1 FROM core_acl_epoch WHERE id=1 AND epoch=?)"+sourceCondition).bind(ctx.now,row.id,connection.id,connection.revision_id,connection.connected_by_member_id,ctx.actor.workspaceId,connection.container_id,connection.container_id,connection.container_id,connection.container_id,event.page_id,event.container_id,epoch!.epoch,...(connection.source_connection_id?[connection.source_connection_id,connection.source_connection_revision_id!,connection.connected_by_member_id]:[])).run();if(!claim.meta.changes)continue;
   dispatched=true;
   const receipt=await adapter.send(token,channel,text,key);
   await ctx.db.batch([ctx.db.prepare("UPDATE chat_deliveries SET state='delivered',delivered_at=?,provider_receipt=?,failure=NULL WHERE id=? AND state='dispatching'").bind(ctx.now,receipt,row.id),ctx.db.prepare('UPDATE chat_connections SET last_delivered_at=?,last_delivery_event=?,updated_at=? WHERE id=?').bind(ctx.now,event.event,ctx.now,connection.id)]);processed++;
  }catch(error){
   const failure=error instanceof ChatProviderError?error.code:error instanceof ApiProblem?error.code:'delivery_failed';const auth=error instanceof ChatProviderError&&error.auth||error instanceof ApiProblem&&[401,403,404].includes(error.status);
   const attempts=row.attempts+1;const first=row.first_attempt_at??ctx.now;const transient=error instanceof ChatProviderError&&error.transient;const uncertain=dispatched&&(!(error instanceof ChatProviderError)||error.uncertain);
   const retry=transient&&!uncertain&&attempts<3&&Date.parse(ctx.now)-Date.parse(first)<300000;
   await ctx.db.batch([ctx.db.prepare('UPDATE chat_deliveries SET state=?,attempts=?,first_attempt_at=COALESCE(first_attempt_at,?),next_attempt_at=?,failure=? WHERE id=?').bind(uncertain?'uncertain':retry?'pending':'failed',attempts,first,retry?new Date(Date.parse(ctx.now)+60000).toISOString():null,failure,row.id),ctx.db.prepare("UPDATE chat_connections SET last_failed_at=?,last_failure_reason=?,state=CASE WHEN ? THEN 'needs-attention' ELSE state END,needs_attention_reason=CASE WHEN ? THEN ? ELSE needs_attention_reason END,updated_at=? WHERE id=?").bind(ctx.now,failure,auth?1:0,auth?1:0,failure,ctx.now,connection.id)]);
  }
 }
 // A worker lost after dispatch must never blindly repeat an external write.
 await ctx.db.prepare("UPDATE chat_deliveries SET state='uncertain',failure='dispatch_interrupted' WHERE state='dispatching' AND first_attempt_at<? AND connection_id IN (SELECT id FROM chat_connections WHERE workspace_id=?)").bind(new Date(Date.parse(ctx.now)-60000).toISOString(),ctx.actor.workspaceId).run();
 return {processed};
}
export async function chatDeliveryHistory(ctx:FeatureContext,id?:string){if(id)await managedChat(ctx,id);else await requireChatOwner(ctx);return ctx.db.prepare('SELECT d.connection_id AS destinationId,d.id,d.state,d.attempts,d.delivered_at AS deliveredAt,d.failure,d.created_at AS createdAt FROM chat_deliveries d JOIN chat_connections c ON c.id=d.connection_id WHERE c.workspace_id=? AND (? IS NULL OR c.id=?) ORDER BY d.created_at DESC LIMIT 100').bind(ctx.actor.workspaceId,id??null,id??null).all();}

/** Read-back only: ambiguous writes are never resubmitted even when history has no matching receipt. */
export async function reconcileChat(ctx:FeatureContext,config:ChatConfig):Promise<{reconciled:number}>{
 const rows=await ctx.db.prepare("SELECT d.*,c.provider,c.container_id,c.destination,c.credential_ciphertext,c.revision_id,c.source_connection_id,c.source_connection_revision_id,c.connected_by_member_id FROM chat_deliveries d JOIN chat_connections c ON c.id=d.connection_id WHERE c.workspace_id=? AND d.state='uncertain' AND c.state='connected' ORDER BY d.created_at LIMIT 100").bind(ctx.actor.workspaceId).all<Delivery&ChatCredentialRow&{destination:string;provider:ChatProvider;container_id:string|null;revision_id:string;connected_by_member_id:string}>();let reconciled=0;
 for(const row of rows.results){if(!config.credentialKey)throw new ApiProblem(503,'CREDENTIAL_KEY_REQUIRED','CONNECTOR_CREDENTIALS_KEY is required.');const hash=await requestHash(row.id);const key=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  try{const owner=await recipientContext(ctx,row.connected_by_member_id);if(!owner)throw new ApiProblem(403,'CHAT_AUTH_REVOKED','Connection owner unavailable.');await requireChatOwner(owner,row.container_id);const token=await chatCredential(owner,{...row,id:row.connection_id},config.credentialKey);const receipt=await(config.adapter??chatNotifier(row.provider)).findReceipt(token,row.destination.slice(row.provider.length+1),key,row.first_attempt_at??row.created_at);if(receipt){await ctx.db.batch([ctx.db.prepare("UPDATE chat_deliveries SET state='delivered',provider_receipt=?,delivered_at=?,failure=NULL WHERE id=? AND state='uncertain'").bind(receipt,ctx.now,row.id),ctx.db.prepare('UPDATE chat_connections SET last_delivered_at=?,last_delivery_event=(SELECT event FROM notification_outbox WHERE id=?),updated_at=? WHERE id=? AND revision_id=?').bind(ctx.now,row.outbox_id,ctx.now,row.connection_id,row.revision_id)]);reconciled++;}}
  catch(error){const failure=error instanceof ChatProviderError?error.code:error instanceof ApiProblem?error.code:'reconciliation_failed';const auth=error instanceof ChatProviderError&&error.auth||error instanceof ApiProblem&&[401,403,404].includes(error.status);await ctx.db.batch([ctx.db.prepare("UPDATE chat_deliveries SET failure=? WHERE id=? AND state='uncertain'").bind(failure,row.id),ctx.db.prepare("UPDATE chat_connections SET last_failed_at=?,last_failure_reason=?,state=CASE WHEN ? THEN 'needs-attention' ELSE state END,needs_attention_reason=CASE WHEN ? THEN ? ELSE needs_attention_reason END,updated_at=? WHERE id=? AND revision_id=?").bind(ctx.now,failure,auth?1:0,auth?1:0,failure,ctx.now,row.connection_id,row.revision_id)]);}
 }return {reconciled};
}
