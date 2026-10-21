import type {ConnectionRow} from '../connectors/types';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { commitOperation,mutationGuard,requestHash } from '../../app/operations';
import { requireWorkspaceOwner,currentSubject } from '../sharing/current-access';
import {requireChatOwner} from './chat-authority';
import {chatNotifier,type ChatProvider} from './chat-provider';
import { encryptSecret } from '../../platform/secrets/custody';
import { createUlid } from '../../shared/ulid';
import { notificationEvents,type NotificationEvent } from './events';
import { ChatProviderError,type ChatNotifier } from './slack';
export const chatScope=(workspaceId:string,id:string,provider:ChatProvider='slack')=>`${workspaceId}:chat.notifier.v1:${provider}:${id}`;
export interface ChatConfig {credentialKey?:string;appUrl?:string;adapter?:ChatNotifier;sourceConnection?:ConnectionRow;multiple?:boolean}
export async function chatConnection(ctx:FeatureContext){await requireWorkspaceOwner(ctx);return ctx.db.prepare("SELECT id,destination,target_label AS targetLabel,events_json AS eventsJson,state,needs_attention_reason AS needsAttentionReason,last_delivered_at AS lastDeliveredAt,last_delivery_event AS lastDeliveryEvent,last_failed_at AS lastFailedAt,last_failure_reason AS lastFailureReason,source_connection_id AS connectionId,source_connection_revision_id AS connectionRevisionId,revision_id AS revisionId FROM chat_connections WHERE workspace_id=? AND provider='slack' AND container_id IS NULL ORDER BY created_at DESC LIMIT 1").bind(ctx.actor.workspaceId).first();}
export async function mappedAudience(ctx:FeatureContext,emails:string[]):Promise<string[]>{const ids:string[]=[];for(const email of emails){const member=await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND lower(email)=? AND status='active'").bind(ctx.actor.workspaceId,email.toLowerCase()).first<{id:string}>();if(!member)throw new ApiProblem(409,'CHAT_AUDIENCE_UNMAPPED','Every chat member must be an active member of this workspace.');ids.push(member.id);}return ids;}
const projection='id,destination,provider,container_id AS containerId,target_label AS targetLabel,events_json AS eventsJson,state,needs_attention_reason AS needsAttentionReason,last_delivered_at AS lastDeliveredAt,last_delivery_event AS lastDeliveryEvent,last_failed_at AS lastFailedAt,last_failure_reason AS lastFailureReason,source_connection_id AS connectionId,source_connection_revision_id AS connectionRevisionId,revision_id AS revisionId';
export async function chatDestinations(ctx:FeatureContext){
 const subject=await currentSubject(ctx);
 if(subject.isGuest)return {items:[],containers:[],workspaceOwner:false};
 const workspaceOwner=!!await ctx.db.prepare("SELECT id FROM members WHERE id=? AND workspace_id=? AND role='owner' AND member_kind='member' AND status='active'").bind(ctx.actor.id,ctx.actor.workspaceId).first();
 const containers=(await ctx.db.prepare("SELECT id,name FROM containers WHERE workspace_id=? AND (?=1 OR id IN (SELECT container_id FROM container_owners WHERE member_id=?)) ORDER BY name,id").bind(ctx.actor.workspaceId,+workspaceOwner,ctx.actor.id).all()).results;
 const items=(await ctx.db.prepare(`SELECT ${projection} FROM chat_connections WHERE workspace_id=? AND (?=1 OR container_id IN (SELECT container_id FROM container_owners WHERE member_id=?)) ORDER BY created_at,id`).bind(ctx.actor.workspaceId,+workspaceOwner,ctx.actor.id).all()).results;
 return {items,containers,workspaceOwner};
}
export async function managedChat(ctx:FeatureContext,id:string){
 const row=await ctx.db.prepare('SELECT id,provider,container_id,revision_id FROM chat_connections WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<{id:string;provider:ChatProvider;container_id:string|null;revision_id:string}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 await requireChatOwner(ctx,row.container_id);return row;
}
export async function connectChat(ctx:FeatureContext,config:ChatConfig,input:{operationKey:string;id?:string;expectedRevisionId?:string;provider?:ChatProvider;containerId?:string|null;channel:string;token:string;events:NotificationEvent[]}) {
 const provider=input?.provider??'slack',containerId=input?.containerId??null;
 if(!['slack','teams'].includes(provider)||containerId!==null&&(typeof containerId!=='string'||!containerId)||input?.id!==undefined&&typeof input.id!=='string')throw new ApiProblem(400,'INVALID_CHAT_CONFIGURATION','Supply a supported destination and scope.');
 if(!config.multiple&&(provider!=='slack'||containerId!==null))throw new ApiProblem(400,'INVALID_CHAT_CONFIGURATION','Use the destinations door for additional providers and containers.');
 await requireChatOwner(ctx,containerId);if(!config.credentialKey)throw new ApiProblem(503,'CREDENTIAL_KEY_REQUIRED','CONNECTOR_CREDENTIALS_KEY is required.');
 const validChannel=provider==='slack'?/^[CG][A-Z0-9]+$/:/^[a-zA-Z0-9._:@-]{1,200}\/[a-zA-Z0-9._:@-]{1,200}$/;
 if(typeof input.channel!=='string'||!validChannel.test(input.channel)||typeof input.token!=='string'||!input.token||!Array.isArray(input.events)||input.events.some(e=>!notificationEvents.includes(e)))throw new ApiProblem(400,'INVALID_CHAT_CONFIGURATION','Supply a channel, credential and supported events.');
 const tokenHash=await requestHash(input.token);const request={...input,token:tokenHash};
 return commitOperation(ctx,{operationKey:input.operationKey,action:'chat.connect',request,authorize:()=>requireChatOwner(ctx,containerId),prepare:async({revisionId})=>{
  const existing=input.id?await managedChat(ctx,input.id):config.multiple?null:await ctx.db.prepare("SELECT id,revision_id,provider,container_id FROM chat_connections WHERE workspace_id=? AND provider='slack' AND container_id IS NULL AND disconnected_at IS NULL ORDER BY created_at,id LIMIT 1").bind(ctx.actor.workspaceId).first<{id:string;revision_id:string;provider:ChatProvider;container_id:string|null}>();
  const id=existing?.id??createUlid();
  if(existing&&(existing.revision_id!==input.expectedRevisionId||existing.provider!==provider||existing.container_id!==containerId))throw new ApiProblem(409,'REVISION_CONFLICT','Reload the destination; its provider and scope stay fixed.');
  let audience;try{audience=await(config.adapter??chatNotifier(provider)).audience(input.token,input.channel);}catch(error){if(error instanceof ChatProviderError){
   const refusal:Record<string,string>={private_unshared_channel_required:'Choose a private Slack channel that is not shared with another workspace or organization.',unverifiable_audience:'Make every channel member’s email visible and remove unsupported identities before connecting.',empty_audience:'Add a person whose email matches an active workspace member.'};
   if(refusal[error.code])throw new ApiProblem(422,'CHAT_DESTINATION_REFUSED',refusal[error.code],{reason:error.code});
   throw new ApiProblem(503,'CHAT_PROVIDER_UNAVAILABLE',`The provider could not authorize this destination: ${error.code}.`);
  }throw error;}
  const ids=await mappedAudience(ctx,audience.emails);const encrypted=await encryptSecret(config.credentialKey!,input.token,chatScope(ctx.actor.workspaceId,id,provider));
  const source=config.sourceConnection;
  const statements=[...(source?[mutationGuard(ctx.db,"SELECT state='connected' AND revision_id=? AND member_id=? AND workspace_id=? FROM federation_connections WHERE id=?",[source.revision_id,ctx.actor.id,ctx.actor.workspaceId,source.id])]:[]),
   ...(existing?[mutationGuard(ctx.db,'SELECT revision_id=? FROM chat_connections WHERE id=?',[input.expectedRevisionId!,id])]:[]),
   ctx.db.prepare("INSERT INTO chat_connections(id,workspace_id,destination,target_label,credential_ciphertext,events_json,state,connected_by_member_id,connected_at,created_at,updated_at,audience_member_ids_json,revision_id,provider,container_id) VALUES(?,?,?,?,?,?,'connected',?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET destination=excluded.destination,target_label=excluded.target_label,credential_ciphertext=excluded.credential_ciphertext,events_json=excluded.events_json,state='connected',disconnected_at=NULL,needs_attention_reason=NULL,connected_by_member_id=excluded.connected_by_member_id,connected_at=excluded.connected_at,updated_at=excluded.updated_at,audience_member_ids_json=excluded.audience_member_ids_json,revision_id=excluded.revision_id")
    .bind(id,ctx.actor.workspaceId,`${provider}:${input.channel}`,provider==='slack'?`${audience.teamId}/${input.channel}`:input.channel,encrypted,JSON.stringify(input.events),ctx.actor.id,ctx.now,ctx.now,ctx.now,JSON.stringify(ids),revisionId,provider,containerId),
   ctx.db.prepare('INSERT INTO discovery_revisions VALUES(?,?,?,?,?,?,?)').bind(revisionId,ctx.actor.workspaceId,ctx.actor.id,'chat-connection',id,JSON.stringify({provider,containerId,channel:input.channel,events:input.events}),ctx.now),
   ctx.db.prepare('UPDATE chat_connections SET source_connection_id=?,source_connection_revision_id=? WHERE id=?').bind(source?.id??null,source?.revision_id??null,id)];
  return {statements,entity:{id,kind:'chat-connection',revisionId},value:{id,state:'connected',revisionId}};
 }});
}
export function disconnectChat(ctx:FeatureContext,input:{operationKey:string;id:string;expectedRevisionId:string}) {return commitOperation(ctx,{operationKey:input.operationKey,action:'chat.disconnect',request:input,authorize:async()=>{await managedChat(ctx,input.id);},prepare:async({revisionId})=>({statements:[mutationGuard(ctx.db,'SELECT revision_id=? FROM chat_connections WHERE id=? AND workspace_id=?',[input.expectedRevisionId,input.id,ctx.actor.workspaceId]),ctx.db.prepare("UPDATE chat_connections SET credential_ciphertext=NULL,source_connection_id=NULL,source_connection_revision_id=NULL,state='disconnected',disconnected_at=?,updated_at=?,revision_id=? WHERE id=? AND workspace_id=?").bind(ctx.now,ctx.now,revisionId,input.id,ctx.actor.workspaceId),ctx.db.prepare("UPDATE chat_deliveries SET state='cancelled',failure='disconnected' WHERE connection_id=? AND state='pending'").bind(input.id),ctx.db.prepare('INSERT INTO discovery_revisions VALUES(?,?,?,?,?,?,?)').bind(revisionId,ctx.actor.workspaceId,ctx.actor.id,'chat-connection',input.id,JSON.stringify({disconnected:true}),ctx.now)],entity:{id:input.id,kind:'chat-connection',revisionId},value:{id:input.id,state:'disconnected',revisionId}})});}
