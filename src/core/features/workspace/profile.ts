import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {currentSubject,requireWorkspaceOwner} from '../sharing/current-access';
import {identityRevision} from './revisions';
const short=z.string().trim().max(160);
export const profileInput=z.object({operationKey:z.string().min(8).max(160),expectedRevisionId:z.string().nullable(),title:short.optional(),timezone:z.string().min(1).max(100).optional(),team:short.optional(),managerId:z.string().nullable().optional(),tags:z.array(z.object({tag:short.min(1),hidden:z.boolean(),custom:z.boolean()}).strict()).max(100).optional()}).strict();
export type ProfileInput=z.infer<typeof profileInput>;
export const tagKey=(tag:string)=>tag.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export async function saveProfile(ctx:FeatureContext,id:string,input:ProfileInput){
 try{if(input.timezone)new Intl.DateTimeFormat('en-US',{timeZone:input.timezone}).format();}catch{throw new ApiProblem(400,'INVALID_TIMEZONE','Choose a valid time zone.');}
 const authorize=async()=>{const subject=await currentSubject(ctx);if(subject.isGuest)throw new ApiProblem(403,'FORBIDDEN','Guests cannot edit member profiles.');if(id!==ctx.actor.id&&(input.title!==undefined||input.timezone!==undefined||input.tags!==undefined))throw new ApiProblem(403,'OWN_PROFILE_FIELDS','Only the member can edit their title, time zone and expertise.');if(id!==ctx.actor.id||input.team!==undefined||input.managerId!==undefined)await requireWorkspaceOwner(ctx);};
 return commitOperation(ctx,{operationKey:input.operationKey,action:'member.profile',request:{id,...input},authorize,prepare:async({revisionId})=>{
  if(!await ctx.db.prepare("SELECT id FROM members WHERE id=? AND workspace_id=? AND status='active' AND member_kind='member'").bind(id,ctx.actor.workspaceId).first())throw new ApiProblem(404,'NOT_FOUND','Member unavailable.');
  if(input.managerId&&(input.managerId===id||!await ctx.db.prepare("SELECT id FROM members WHERE id=? AND workspace_id=? AND status='active' AND member_kind='member'").bind(input.managerId,ctx.actor.workspaceId).first()))throw new ApiProblem(400,'INVALID_MANAGER','Choose another active member as manager.');
  const prior=await ctx.db.prepare('SELECT * FROM member_profiles WHERE member_id=?').bind(id).first<Record<string,any>>();
  if((prior?.revision_id??null)!==input.expectedRevisionId)throw new ApiProblem(409,'REVISION_CONFLICT','The profile changed. Reload before saving.');
  const tags=[...new Map((input.tags??[]).map(t=>[tagKey(t.tag),t])).entries()];
  return {entity:{id,kind:'member',revisionId},value:{id,revisionId},statements:[mutationGuard(ctx.db,'SELECT COALESCE((SELECT revision_id FROM member_profiles WHERE member_id=?),\'\')=?',[id,input.expectedRevisionId??'']),
   ctx.db.prepare('INSERT INTO member_profiles(member_id,workspace_id,title,team,manager_member_id,timezone,revision_id,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET title=excluded.title,team=excluded.team,manager_member_id=excluded.manager_member_id,timezone=excluded.timezone,revision_id=excluded.revision_id,updated_at=excluded.updated_at').bind(id,ctx.actor.workspaceId,input.title??prior?.title??'',input.team??prior?.team??'',input.managerId===undefined?prior?.manager_member_id??null:input.managerId,input.timezone??prior?.timezone??'UTC',revisionId,ctx.now),
   ...(input.tags===undefined?[]:[ctx.db.prepare('DELETE FROM member_expertise_overrides WHERE member_id=?').bind(id)]),
   ...tags.map(([key,t])=>ctx.db.prepare('INSERT INTO member_expertise_overrides(member_id,tag_key,label,custom,hidden) VALUES(?,?,?,?,?)').bind(id,key,t.tag,+t.custom,+t.hidden)),
   await identityRevision(ctx,revisionId,'member',id,{profileUpdated:true})]};
 }});
}
