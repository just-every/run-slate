import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {createUlid} from '../../shared/ulid';
import {currentSubject,requirePageLevel,requireWorkspaceOwner} from '../sharing/current-access';
import {recipientContext} from '../notifications/outbox';
import {registerNotificationCreationEligibility,notificationStatements} from '../notifications/events';
import {registerNotificationVisibility} from '../notifications/visibility';
import {registerActivityResolver} from '../activity/service';

interface Reading {id:string;workspace_id:string;page_id:string;group_id:string|null;sender_member_id:string|null;reminder_days:number;due_at:string;created_at:string;cancelled_at:string|null}
async function reading(ctx:FeatureContext,id:string){
 await currentSubject(ctx);
 const row=await ctx.db.prepare('SELECT * FROM required_readings WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<Reading>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 await requirePageLevel(ctx,row.page_id,'view');return row;
}
export async function canReport(ctx:FeatureContext,id:string){
 try{const row=await reading(ctx,id);if(row.sender_member_id===ctx.actor.id)return true;await requireWorkspaceOwner(ctx);return true;}
 catch(error){if(error instanceof ApiProblem&&[401,403,404].includes(error.status))return false;throw error;}
}
export async function readingReport(ctx:FeatureContext,id:string){
 if(!await canReport(ctx,id))throw new ApiProblem(404,'NOT_FOUND','Not found.');
 const row=await reading(ctx,id);
 const members=await ctx.db.prepare(`SELECT m.id AS memberId,m.display_name AS displayName,r.eligible,r.acknowledged_at AS acknowledgedAt,r.reminded_at AS remindedAt FROM required_reading_members r JOIN members m ON m.id=r.member_id WHERE r.reading_id=? ORDER BY m.display_name,m.id`).bind(id).all<{memberId:string;displayName:string;eligible:number;acknowledgedAt:string|null;remindedAt:string|null}>();
 return {id:row.id,pageId:row.page_id,createdAt:row.created_at,reminderDays:row.reminder_days,dueAt:row.due_at,cancelledAt:row.cancelled_at,members:members.results.map(({eligible,...m})=>({...m,state:!eligible?'cannot-read':m.acknowledgedAt?'acknowledged':m.remindedAt?'reminded':'pending'}))};
}
export async function ownReading(ctx:FeatureContext,id:string){
 await reading(ctx,id);
 const row=await ctx.db.prepare('SELECT acknowledged_at AS acknowledgedAt FROM required_reading_members WHERE reading_id=? AND member_id=? AND eligible=1').bind(id,ctx.actor.id).first<{acknowledgedAt:string|null}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');return row;
}
export async function pageReadings(ctx:FeatureContext,pageId:string){
 await requirePageLevel(ctx,pageId,'view');
 const rows=await ctx.db.prepare('SELECT id FROM required_readings WHERE page_id=? AND workspace_id=? ORDER BY created_at DESC,id DESC').bind(pageId,ctx.actor.workspaceId).all<{id:string}>();
 const items=[];
 for(const {id} of rows.results)if(await canReport(ctx,id))items.push(await readingReport(ctx,id));
 return {items};
}
export async function previewReading(ctx:FeatureContext,pageId:string,groupId:string){
 await requireWorkspaceOwner(ctx);await requirePageLevel(ctx,pageId,'view');
 if(!await ctx.db.prepare('SELECT 1 FROM groups WHERE id=? AND workspace_id=?').bind(groupId,ctx.actor.workspaceId).first())throw new ApiProblem(404,'NOT_FOUND','Not found.');
 const members=await ctx.db.prepare("SELECT m.id AS memberId,m.display_name AS displayName FROM group_members gm JOIN members m ON m.id=gm.member_id WHERE gm.group_id=? AND m.workspace_id=? AND m.status='active' AND m.member_kind='member' ORDER BY m.display_name,m.id").bind(groupId,ctx.actor.workspaceId).all<{memberId:string;displayName:string}>();
 const readers:typeof members.results=[],excluded:typeof members.results=[];
 for(const member of members.results){const recipient=await recipientContext(ctx,member.memberId);let readable=false;if(recipient)try{await requirePageLevel(recipient,pageId,'view');readable=true;}catch(e){if(!(e instanceof ApiProblem)||![401,404].includes(e.status))throw e;}(readable?readers:excluded).push(member);}
 return {readers,excluded};
}
export async function sendReading(ctx:FeatureContext,input:{operationKey:string;pageId:string;groupId:string;reminderDays:number}){
 if(!input||typeof input.pageId!=='string'||typeof input.groupId!=='string'||!Number.isInteger(input.reminderDays)||input.reminderDays<1||input.reminderDays>365)throw new ApiProblem(400,'INVALID_REQUIRED_READING','Choose a group and 1–365 days.');
 let audience:Awaited<ReturnType<typeof previewReading>>;
 return commitOperation(ctx,{operationKey:input.operationKey,action:'required-reading.send',request:input,authorize:async()=>{audience=await previewReading(ctx,input.pageId,input.groupId);},prepare:async({revisionId})=>{
  const id=createUlid(),dueAt=new Date(Date.parse(ctx.now)+input.reminderDays*86400000).toISOString();
  const statements=[ctx.db.prepare('INSERT INTO required_readings(id,workspace_id,page_id,group_id,sender_member_id,reminder_days,due_at,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,ctx.actor.workspaceId,input.pageId,input.groupId,ctx.actor.id,input.reminderDays,dueAt,ctx.now)];
  for(const [eligible,members] of [[1,audience.readers],[0,audience.excluded]] as const)for(const member of members)statements.push(ctx.db.prepare('INSERT INTO required_reading_members(reading_id,member_id,eligible) VALUES(?,?,?)').bind(id,member.memberId,eligible));
  statements.push(...notificationStatements(ctx,{id:`required-reading:${id}`,event:'required-reading',actorId:null,pageId:input.pageId,recipientIds:audience.readers.map(m=>m.memberId),detail:{requiredReadingId:id}}));
  return {statements,entity:{kind:'required-reading',id,revisionId},value:{id,pageId:input.pageId,dueAt,readers:audience.readers,excluded:audience.excluded},detail:{pageId:input.pageId}};
 }});
}
export async function acknowledgeReading(ctx:FeatureContext,id:string,input:{operationKey:string}){
 return commitOperation(ctx,{operationKey:input.operationKey,action:'required-reading.acknowledge',request:{id,...input},authorize:async()=>{
  await reading(ctx,id);
  if(!await ctx.db.prepare('SELECT 1 FROM required_reading_members WHERE reading_id=? AND member_id=? AND eligible=1').bind(id,ctx.actor.id).first())throw new ApiProblem(404,'NOT_FOUND','Not found.');
 },prepare:async({revisionId})=>{
  const previous=await ctx.db.prepare('SELECT acknowledged_at FROM required_reading_members WHERE reading_id=? AND member_id=?').bind(id,ctx.actor.id).first<{acknowledged_at:string|null}>();
  return {statements:[...(previous?.acknowledged_at?[]:[mutationGuard(ctx.db,'SELECT acknowledged_at IS NULL FROM required_reading_members WHERE reading_id=? AND member_id=?',[id,ctx.actor.id])]),ctx.db.prepare('UPDATE required_reading_members SET acknowledged_at=COALESCE(acknowledged_at,?) WHERE reading_id=? AND member_id=? AND eligible=1').bind(ctx.now,id,ctx.actor.id)],entity:{kind:'required-reading',id,revisionId},value:{id,memberId:ctx.actor.id,acknowledgedAt:previous?.acknowledged_at??ctx.now},noChange:!!previous?.acknowledged_at};
 }});
}
/** Feature-owned evidence prevents inbox or activity reads from disclosing anyone else's acknowledgment. */
export function registerRequiredReadingVisibility(){
 registerActivityResolver('required-reading',canReport);
 for(const event of ['required-reading','required-reading-reminder'] as const)registerNotificationCreationEligibility(event,(m,fact)=>({sql:`EXISTS(SELECT 1 FROM required_reading_members rm WHERE rm.reading_id=? AND rm.member_id=${m}.id AND rm.eligible=1 ${event==='required-reading-reminder'?'AND rm.acknowledged_at IS NULL':''})`,values:[fact.detail?.requiredReadingId??'']}));
 for(const event of ['required-reading','required-reading-reminder'] as const)registerNotificationVisibility(event,async(ctx,detail)=>{
  if(!detail.requiredReadingId)return false;
  const row=await ctx.db.prepare(`SELECT 1 FROM required_reading_members m JOIN required_readings r ON r.id=m.reading_id WHERE r.id=? AND r.workspace_id=? AND m.member_id=? AND m.eligible=1 ${event==='required-reading-reminder'?'AND m.acknowledged_at IS NULL':''}`).bind(detail.requiredReadingId,ctx.actor.workspaceId,ctx.actor.id).first();return !!row;
 });
}
