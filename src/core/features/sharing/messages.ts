import seed from '../../../../seed.json';
import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {commitOperation} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {requirePageLevel} from './current-access';
import {prepareGrant} from './grants';
import {notificationStatements} from '../notifications/events';
import {messageRecipients,shareRecipientsSchema} from './message-recipients';
export const shareMessageSchema=z.object({operationKey:z.string().min(8).max(160),recipients:shareRecipientsSchema,message:z.string().max(seed.limits.shareMessageCharacters).default('')}).strict();
interface ShareIntent {message:string;memberIds:string[];emails:string[]}
export async function shareIntent(ctx:FeatureContext,shareId:string,pageId:string){
 const row=await ctx.db.prepare("SELECT detail_json FROM activity_entries WHERE id=? AND workspace_id=? AND actor_member_id=? AND target_kind='page' AND target_id=? AND action='sharing.message'").bind(shareId,ctx.actor.workspaceId,ctx.actor.id,pageId).first<{detail_json:string}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 const detail=JSON.parse(row.detail_json) as Partial<ShareIntent>;
 if(typeof detail.message!=='string'||!Array.isArray(detail.memberIds)||!Array.isArray(detail.emails))throw new ApiProblem(404,'NOT_FOUND','Not found.');
 return detail as ShareIntent;
}
export function shareNotification(ctx:FeatureContext,pageId:string,shareId:string,memberId:string,message:string){
 return notificationStatements(ctx,{id:`share:${shareId}:${memberId}`,event:'page-shared',pageId,recipientIds:[memberId],detail:{share:{id:shareId,senderId:ctx.actor.id,message}}});
}
export async function sendPageMessage(ctx:FeatureContext,pageId:string,input:z.infer<typeof shareMessageSchema>){
 return commitOperation(ctx,{operationKey:input.operationKey,action:'sharing.message',request:{pageId,...input},authorize:()=>requirePageLevel(ctx,pageId,'full').then(()=>{}),prepare:async({revisionId,activityId})=>{
  const recipients=await messageRecipients(ctx,pageId,input.recipients);
  return {entity:{kind:'page',id:pageId,revisionId},value:{shareId:activityId,...recipients},detail:{message:input.message,memberIds:[...recipients.readable,...recipients.needsAccess].map(r=>r.id),emails:recipients.emails},statements:recipients.readable.flatMap(recipient=>shareNotification(ctx,pageId,activityId,recipient.id,input.message))};
 }});
}
export async function grantPageMessage(ctx:FeatureContext,pageId:string,input:{operationKey:string;shareId:string;memberId:string}){
 return commitOperation(ctx,{operationKey:input.operationKey,action:'sharing.message-grant',request:{pageId,...input},authorize:()=>requirePageLevel(ctx,pageId,'full').then(()=>{}),prepare:async({revisionId})=>{
  const intent=await shareIntent(ctx,input.shareId,pageId);
  if(!intent.memberIds.includes(input.memberId))throw new ApiProblem(400,'INVALID_RECIPIENT','This person was not selected for this share.');
  const grant=await prepareGrant(ctx,{operationKey:input.operationKey,targetKind:'page',targetId:pageId,principalKind:'member',principalId:input.memberId,level:'view'},revisionId,false,`share:${input.shareId}:${input.memberId}`);
  // Outbox identity belongs to the original share, across explicit confirmations.
  return {...grant,detail:{shareId:input.shareId,grantId:grant.value.id},statements:[...grant.statements,...shareNotification(ctx,pageId,input.shareId,input.memberId,intent.message)]};
 }});
}
