import assert from 'node:assert/strict';
import {completeFirstRun} from '../../../src/core/features/workspace/bootstrap';
import {notificationStatements} from '../../../src/core/features/notifications/events';
import {processNotificationOutbox} from '../../../src/core/features/notifications/outbox';
import {notificationList,today,notificationAction} from '../../../src/core/features/notifications/service';
import {connectChat,chatConnection,disconnectChat} from '../../../src/core/features/notifications/chat-config';
import {deliverChat} from '../../../src/core/features/notifications/chat-delivery';
import {ChatProviderError} from '../../../src/core/features/notifications/slack';
import {assertStoredConfiguration} from '../../../src/core/app/runtime-gate';
export async function notificationMechanics(env:any,check:any){
 const db=env.DB as D1Database,actor=await db.prepare('SELECT id,workspace_id AS workspaceId,email,display_name AS displayName,initials,role FROM members LIMIT 1').first<any>();actor.workspaceName='Qualification';
 const now=new Date().toISOString(),ctx:any={db,files:env.FILES,jobs:env.JOBS,actor,now};
 const first=await completeFirstRun(ctx,{operationKey:'notification-first-run',workspaceName:'Qualification',containerName:'Shared',pageTitle:'Notification page'});const pageId=first.value.pageId;
 await db.prepare("INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES('notice-reader',?,'notice-reader@test.invalid','Notice reader','NR','member',?,?)").bind(actor.workspaceId,now,now).run();
 const reader={...ctx,actor:{...actor,id:'notice-reader',email:'notice-reader@test.invalid',displayName:'Notice reader',role:'member'}};
 await check(['NOTIF-001','NOTIF-002','BASE-OPS-003'],'notification-delivery-duplicate-self-and-quiet-Today',async()=>{
 for(const [id,event] of [['notice-a','maintenance'],['notice-b','maintenance'],['notice-mention','mention']] as const)await db.batch(notificationStatements(ctx,{id,event,pageId,recipientIds:['notice-reader',actor.id]}));
 await processNotificationOutbox(ctx);await processNotificationOutbox(ctx);
 assert.equal((await notificationList(ctx)).items.length,0);const inbox=await notificationList(reader);assert.equal(inbox.items.length,3);assert.equal(inbox.unreadCount,3);
 const current=await today(reader);assert.equal(current.outcomes.length,1);assert.equal(current.outcomes[0].count,2);assert.equal(current.notices.length,1);assert.equal(current.notices[0].event,'mention');
 await notificationAction(reader,{operationKey:'read-mentions',action:'read',id:'notice-mention:notice-reader'});assert.equal((await notificationList(reader)).unreadCount,2);
 });
 const token='LABELLED-CHAT-TEST-CREDENTIAL',credentialKey='test-custody-key-with-more-than-32-characters',sent:string[]=[];let mode='success';
 const adapter:any={audience:async()=>({emails:['notice-reader@test.invalid'],teamId:'TTEST'}),send:async(_token:string,_channel:string,text:string)=>{if(mode==='transient')throw new ChatProviderError('controlled_transient',true);sent.push(text);return 'TEST-CHAT-RECEIPT';},findReceipt:async()=>null};
 const config={adapter,credentialKey,appUrl:'https://slate.test.invalid'};
 const connected=await connectChat(ctx,config,{operationKey:'test-chat-connect',channel:'GTEST',token,events:['mention','maintenance']});
 await check(['NOTIF-003','BASE-SECRET-001','BASE-SECRET-002'],'chat-encrypted-link-only-and-key-fails-closed',async()=>{
 const stored=await db.prepare('SELECT credential_ciphertext FROM chat_connections WHERE id=?').bind(connected.value.id).first<any>();assert.ok(stored.credential_ciphertext);assert.equal(stored.credential_ciphertext.includes(token),false);assert.equal(JSON.stringify(await chatConnection(ctx)).includes(token),false);await assert.rejects(assertStoredConfiguration(env),/CONNECTOR_CREDENTIALS_KEY/);
 await db.batch(notificationStatements(ctx,{id:'chat-mention',event:'mention',pageId,recipientIds:['notice-reader']}));await processNotificationOutbox(ctx);await deliverChat(ctx,config);assert.equal(sent.length,1);assert.match(sent[0],/https:\/\/slate.test.invalid\/app\/pages\//);assert.equal(sent[0].includes('body'),false);
 });
 await check(['NOTIF-003'],'chat-transient-retries-bounded-and-disconnect-destroys',async()=>{
 mode='transient';await db.batch(notificationStatements(ctx,{id:'chat-failure',event:'mention',pageId,recipientIds:['notice-reader']}));await processNotificationOutbox(ctx);
 for(let n=0;n<3;n++)await deliverChat({...ctx,now:new Date(Date.parse(now)+n*60000).toISOString()},config);
 const row=await db.prepare("SELECT state,attempts FROM chat_deliveries WHERE outbox_id='chat-failure'").first<any>();assert.deepEqual(row,{state:'failed',attempts:3});const connection:any=await chatConnection(ctx);assert.ok(connection.lastFailureReason);
 await disconnectChat(ctx,{operationKey:'test-chat-disconnect',id:connected.value.id,expectedRevisionId:connected.value.revisionId});assert.equal((await db.prepare('SELECT credential_ciphertext FROM chat_connections WHERE id=?').bind(connected.value.id).first<any>()).credential_ciphertext,null);const count=sent.length;mode='success';await deliverChat(ctx,config);assert.equal(sent.length,count);
 });
}
