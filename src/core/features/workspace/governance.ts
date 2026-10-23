import { z } from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {currentSubject,requireWorkspaceOwner,requireContainerLevel,requirePageLevel} from '../sharing/current-access';
import {identityRevision} from './revisions';

export const governanceCapabilities=['createContainers','publishPublicly','inviteGuests','export','useAi'] as const;
export type GovernanceCapability=typeof governanceCapabilities[number];
const threshold=z.enum(['owner','admin','member']);
export const governanceSchema=z.object({createContainers:threshold,publishPublicly:threshold,inviteGuests:threshold,export:threshold,useAi:threshold}).strict();
export type Governance=z.infer<typeof governanceSchema>;
const capabilityNames:Record<GovernanceCapability,string>={createContainers:'creating spaces',publishPublicly:'public publishing',inviteGuests:'guest invitations',export:'content export',useAi:'assistance'};
const defaults:Governance={createContainers:'member',publishPublicly:'member',inviteGuests:'member',export:'member',useAi:'member'};
const closed:Governance={createContainers:'owner',publishPublicly:'owner',inviteGuests:'owner',export:'owner',useAi:'owner'};
const latest="SELECT id,content_json FROM core_entity_revisions WHERE workspace_id=? AND entity_kind=? AND entity_id=? ORDER BY CAST(json_extract(content_json,'$.configurationSequence') AS INTEGER) DESC,id DESC LIMIT 1";
async function stored(ctx:FeatureContext,kind:string,id:string){return ctx.db.prepare(latest).bind(ctx.actor.workspaceId,kind,id).first<{id:string;content_json:string}>();}
export async function readGovernance(ctx:FeatureContext){
 await currentSubject(ctx);const row=await stored(ctx,'content-governance',ctx.actor.workspaceId);
 const parsed=row?governanceSchema.safeParse(JSON.parse(row.content_json).rules):null;
 return {configured:!!row,revisionId:row?.id??null,rules:parsed?.success?parsed.data:row?closed:defaults};
}
export async function requireGovernance(ctx:FeatureContext,capability:GovernanceCapability,pageId?:string){
 const subject=await currentSubject(ctx);
 const role=await ctx.db.prepare("SELECT role FROM members WHERE id=? AND workspace_id=? AND status='active'").bind(ctx.actor.id,ctx.actor.workspaceId).first<{role:string}>();
 const {rules,configured}=await readGovernance(ctx);
 // There is no workspace Admin role yet; its threshold therefore admits only owners.
 if(configured && (subject.isGuest || role?.role!=='owner'&&rules[capability]!=='member'))throw new ApiProblem(403,'GOVERNANCE_FORBIDDEN',`Content governance limits ${capabilityNames[capability]} to ${rules[capability]} authority.`);
 if(pageId){
  await requirePageLevel(ctx,pageId,'view');
  const page=await ctx.db.prepare('SELECT container_id FROM pages WHERE id=? AND workspace_id=?').bind(pageId,ctx.actor.workspaceId).first<{container_id:string}>();
  if(page && (capability==='useAi'||capability==='publishPublicly')){
   const label=await classification(ctx,page.container_id);
   if(capability==='useAi'&&label.label==='Confidential'&&!label.allowAi)throw new ApiProblem(403,'GOVERNANCE_CONFIDENTIAL','Content governance forbids AI use for Confidential pages.');
   if(capability==='publishPublicly'&&label.label==='Confidential'){const c=await ctx.db.prepare('SELECT public_link_access FROM containers WHERE id=?').bind(page.container_id).first<{public_link_access:string}>();if(c?.public_link_access==='forbidden')throw new ApiProblem(403,'GOVERNANCE_CONFIDENTIAL','Content governance forbids public links for this Confidential space.');}
  }
 }
}
async function configuration(ctx:FeatureContext,kind:string,id:string,expectedRevisionId:string|null,value:Record<string,unknown>,revisionId:string){
 const before=await stored(ctx,kind,id), sequence=before?Number(JSON.parse(before.content_json).configurationSequence??0)+1:1;
 return [mutationGuard(ctx.db,`SELECT (${latest.replace('SELECT id,content_json','SELECT id')}) IS ?`,[ctx.actor.workspaceId,kind,id,expectedRevisionId]),await identityRevision(ctx,revisionId,kind,id,{...value,configurationSequence:sequence}),ctx.db.prepare('UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1')];
}
export async function saveGovernance(ctx:FeatureContext,input:{operationKey:string;expectedRevisionId:string|null;rules:Governance}){
 const rules=governanceSchema.parse(input.rules);
 return commitOperation(ctx,{operationKey:input.operationKey,action:'workspace.governance',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>{
  const before=await readGovernance(ctx);
  return {entity:{id:ctx.actor.workspaceId,kind:'workspace',revisionId},value:{revisionId,rules},detail:{before:before.rules,after:rules},statements:await configuration(ctx,'content-governance',ctx.actor.workspaceId,input.expectedRevisionId,{rules},revisionId)};
 }});
}
async function classification(ctx:FeatureContext,id:string){
 const row=await stored(ctx,'container-classification',id),value=row?JSON.parse(row.content_json):null;
 return {revisionId:row?.id??null,label:row&&value.label!=='none'?'Confidential' as const:'none' as const,allowAi:value?.allowAi===true};
}
export async function readClassification(ctx:FeatureContext,id:string){
 await requireContainerLevel(ctx,id,'view');return classification(ctx,id);
}
export async function saveClassification(ctx:FeatureContext,id:string,input:{operationKey:string;expectedRevisionId:string|null;label:'none'|'Confidential';allowAi?:boolean}){
 return commitOperation(ctx,{operationKey:input.operationKey,action:'container.classification',request:{id,...input},authorize:async()=>{await requireWorkspaceOwner(ctx);await requireContainerLevel(ctx,id,'full');},prepare:async({revisionId})=>{
  const before=await readClassification(ctx,id);
  const statements=await configuration(ctx,'container-classification',id,input.expectedRevisionId,{label:input.label,allowAi:input.allowAi??false},revisionId);
  if(input.label==='Confidential')statements.push(ctx.db.prepare("UPDATE containers SET public_link_access='forbidden',revision_id=?,updated_at=? WHERE id=? AND workspace_id=?").bind(revisionId,ctx.now,id,ctx.actor.workspaceId));
  return {entity:{id,kind:'container',revisionId},value:{revisionId,label:input.label},detail:{before:before.label,after:input.label,allowAi:input.allowAi??false,publicLinksStopped:input.label==='Confidential'},statements};
 }});
}
