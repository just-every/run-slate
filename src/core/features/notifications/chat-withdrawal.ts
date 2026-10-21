import type {FeatureContext} from '../../app/feature-context';
import {chatCredential,type ChatCredentialRow} from './chat-credential';
import {chatNotifier,type ChatProvider} from './chat-provider';
import {mappedAudience,type ChatConfig} from './chat-config';
import {eventReadable,recipientContext} from './outbox';
import {ChatProviderError} from './slack';

/** No titles, bodies or email snapshots live in this durable receipt ledger. */
export async function withdrawChat(ctx:FeatureContext,config:ChatConfig){
 const rows=await ctx.db.prepare(`SELECT m.*,c.destination,c.credential_ciphertext,c.source_connection_id,
 c.source_connection_revision_id,COALESCE(c.notifier_provider,c.provider) AS provider,c.connected_by_member_id
 FROM chat_messages m JOIN chat_connections c ON c.id=m.connection_id
 WHERE c.workspace_id=? AND c.state='connected' AND m.state IN ('sent','withdraw') AND m.provider_receipt IS NOT NULL
 AND (m.next_attempt_at IS NULL OR m.next_attempt_at<=?) ORDER BY m.created_at,m.id`).bind(ctx.actor.workspaceId,ctx.now).all<ChatCredentialRow&{id:string;connection_id:string;state:string;destination:string;provider:ChatProvider;provider_receipt:string;connected_by_member_id:string}>();
 for(const row of rows.results){
  let restricted=row.state==='withdraw';
  try{
   if(!config.credentialKey||!row.credential_ciphertext&&!row.source_connection_id)continue;
   const owner=await recipientContext(ctx,row.connected_by_member_id);if(!owner)continue;
   const token=await chatCredential(owner,{...row,id:row.connection_id},config.credentialKey);
   const adapter=config.adapter??chatNotifier(row.provider,config.nookDoor),channel=row.destination.slice(row.provider.length+1);
   if(!restricted){
    const sources=(await ctx.db.prepare('SELECT page_id,actor_member_id FROM chat_message_sources WHERE message_id=?').bind(row.id).all<{page_id:string|null;actor_member_id:string|null}>()).results;
    let ids:string[]=[];
    try{ids=await mappedAudience(ctx,(await adapter.audience(token,channel)).emails);}catch(error){if(error instanceof ChatProviderError&&(error.transient||error.auth))throw error;restricted=true;}
    for(const source of sources){
     if(source.actor_member_id&&!await recipientContext(ctx,source.actor_member_id)){restricted=true;break;}
     if(source.page_id){
      const page=await ctx.db.prepare('SELECT id FROM pages WHERE id=? AND deleted_at IS NULL').bind(source.page_id).first();
      if(!page){restricted=true;break;}
      for(const id of ids){const reader=await recipientContext(ctx,id);if(!reader||!await eventReadable(reader,{page_id:source.page_id,container_id:null,detail_json:'{}'})){restricted=true;break;}}
     }
    }
   }
   if(!restricted)continue;
   await ctx.db.prepare("UPDATE chat_messages SET state='withdraw' WHERE id=?").bind(row.id).run();
   // Redaction discloses no new title and does not require a readable audience.
   await adapter.edit(token,channel,row.provider_receipt,'Restricted Slate page');
   await ctx.db.batch([
    ctx.db.prepare("UPDATE chat_messages SET state='restricted',failure=NULL,next_attempt_at=NULL WHERE id=?").bind(row.id),
    ctx.db.prepare('UPDATE chat_message_sources SET actor_member_id=NULL WHERE message_id=?').bind(row.id),
   ]);
  }catch(error){
   const failure=error instanceof ChatProviderError?error.code:'withdrawal_failed';
   const at=new Date(Date.parse(ctx.now)+(error instanceof ChatProviderError?error.retryAfterMs??60000:60000)).toISOString();
   await ctx.db.prepare('UPDATE chat_messages SET failure=?,next_attempt_at=? WHERE id=?').bind(failure,at,row.id).run();
  }
 }
}
