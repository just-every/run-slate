import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import {readRevision} from '../versions/service';
import { requirePageLevel } from '../sharing/current-access';
import { resolveEvidence as resolveSourceEvidence } from '../source-memory/service';
import type { EvidenceInput, EvidencePacket, Answer } from './contracts';
export async function audienceContext(ctx:FeatureContext,memberId:string):Promise<FeatureContext>{
 const actor=await ctx.db.prepare("SELECT id,workspace_id AS workspaceId,display_name AS displayName,email,role FROM members WHERE id=? AND workspace_id=? AND status='active'").bind(memberId,ctx.actor.workspaceId).first<{id:string;workspaceId:string;displayName:string;email:string;role:'owner'|'member'}>();
 if(!actor)throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','Evidence is unavailable for this audience.');
 return {...ctx,actor:{...actor,workspaceName:ctx.actor.workspaceName,initials:''}};
}
export async function resolveEvidence(ctx:FeatureContext,refs:EvidenceInput[],audience:string[],options:{current?:boolean;cutoff?:string;depth?:number}={}):Promise<EvidencePacket[]>{
 if((options.depth??0)>8)throw new ApiProblem(409,'EVIDENCE_DEPTH','The source chain exceeds its bounded depth.');
 const epoch=(await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>())!.epoch;
 const readers=[...new Set([ctx.actor.id,...audience])]; const result:EvidencePacket[]=[];
 for(const [index,ref] of refs.entries()){
  if(ref.kind==='decision'||ref.kind==='skill'){
   const row=ref.kind==='decision'?await ctx.db.prepare("SELECT d.*,r.content_json AS content,r.created_at AS observed_at,d.state,r.id AS current_id,p.lifecycle AS page_lifecycle,p.trashed_at AS page_trashed_at,p.deleted_at AS page_deleted_at FROM knowledge_decisions d JOIN pages p ON p.id=d.page_id JOIN intelligence_revisions r ON r.entity_id=d.id AND r.entity_kind='decision-acceptance' WHERE d.id=? AND d.workspace_id=? AND r.id=?").bind(ref.sourceId,ctx.actor.workspaceId,ref.revisionId).first<{page_id:string;content:string;observed_at:string;state:string;current_id:string;removed_at?:string|null;accepted_revision_id?:string|null;page_lifecycle:string;page_trashed_at:string|null;page_deleted_at:string|null}>():await ctx.db.prepare("SELECT s.page_id,v.definition_json AS content,v.created_at AS observed_at,v.state,s.current_revision_id AS current_id,p.lifecycle AS page_lifecycle,p.trashed_at AS page_trashed_at,p.deleted_at AS page_deleted_at FROM intelligence_skills s JOIN pages p ON p.id=s.page_id JOIN intelligence_skill_versions v ON v.skill_id=s.id WHERE s.id=? AND s.workspace_id=? AND v.id=?").bind(ref.sourceId,ctx.actor.workspaceId,ref.revisionId).first<{page_id:string;content:string;observed_at:string;state:string;current_id:string;removed_at?:string|null;accepted_revision_id?:string|null;page_lifecycle:string;page_trashed_at:string|null;page_deleted_at:string|null}>();
   if(!row||(options.cutoff&&row.observed_at>options.cutoff))throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The exact evidence revision is unavailable.');
   for(const reader of readers)await requirePageLevel(reader===ctx.actor.id?ctx:await audienceContext(ctx,reader),row.page_id,'view');
   const content=JSON.parse(row.content);if(ref.kind==='skill'&&(!Array.isArray(content.audience)||readers.some(reader=>!content.audience.includes(reader))))throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The method is not available for this audience.');const nested=ref.kind==='decision'?content.citations:content.refs;
   if(!Array.isArray(nested))throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The exact evidence revision is unavailable.');
   const nestedPackets=await resolveEvidence(ctx,nested,readers,{...options,depth:(options.depth??0)+1});
   const backingCurrent=!row.page_trashed_at&&!row.page_deleted_at&&['live','live-with-unpublished-changes'].includes(row.page_lifecycle);
   const ownCurrent=ref.kind==='decision'?row.state==='accepted'&&!row.removed_at&&row.accepted_revision_id===ref.revisionId:row.state==='active'&&row.current_id===ref.revisionId;
   const current=backingCurrent&&ownCurrent&&nestedPackets.every(packet=>packet.current);
   if(options.current&&!current)throw new ApiProblem(409,'STALE_EVIDENCE','The accepted decision or evaluated procedure has changed.');
   result.push({id:`E${index+1}`,ref,text:row.content,current,observedAt:row.observed_at,authorityState:ref.kind==='decision'?'accepted-decision-not-entitlement-or-customer-consent':'evaluated-method-not-action-authority'});continue;
  }
  if(ref.kind==='source'){
   const source=await resolveSourceEvidence(ctx,{sourceId:ref.sourceId,sourceRevisionId:ref.revisionId,passageId:ref.passageId},{secret:(ctx as FeatureContext & {sourceSecret?:string}).sourceSecret,audienceMemberIds:readers,requireCurrent:options.current});
   if(source.state!=='available'||(options.cutoff&&source.observedAt>options.cutoff))throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The exact evidence revision is unavailable.');
   result.push({id:`E${index+1}`,ref,text:source.text,current:source.freshness==='current',observedAt:source.observedAt,authorityState:source.authorityState});continue;
  }
  for(const reader of readers){const exact=await readRevision(reader===ctx.actor.id?ctx:await audienceContext(ctx,reader),ref.sourceId,ref.revisionId);if('deleted'in exact&&exact.deleted)throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The exact evidence revision is unavailable.');}
  const row=await ctx.db.prepare("SELECT r.body_json,r.properties_json,r.created_at,p.working_revision_id,p.lifecycle,p.trashed_at FROM page_revisions r JOIN pages p ON p.id=r.page_id WHERE r.id=? AND r.page_id=? AND r.deleted_at IS NULL AND p.deleted_at IS NULL AND p.workspace_id=?").bind(ref.revisionId,ref.sourceId,ctx.actor.workspaceId).first<{body_json:string;properties_json:string;created_at:string;working_revision_id:string;lifecycle:string;trashed_at:string|null}>();
  if(!row||row.trashed_at||['archived','draft','scheduled'].includes(row.lifecycle)||(options.cutoff&&row.created_at>options.cutoff))throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The exact evidence revision is unavailable.');
  if(options.current&&row.working_revision_id!==ref.revisionId)throw new ApiProblem(409,'STALE_EVIDENCE','Evidence changed; regenerate against the current revision.');
  result.push({id:`E${index+1}`,ref,text:jsonText(row.body_json,row.properties_json),current:row.working_revision_id===ref.revisionId,observedAt:row.created_at,authorityState:'document-not-authority'});
 }
 if((await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>())!.epoch!==epoch)throw new ApiProblem(409,'AUTHORIZATION_CHANGED','Authorization changed while preparing the evidence packet.');
 ctx.authorizationEpoch=epoch;return result;
}
function jsonText(body:string,properties:string){return JSON.stringify({body:JSON.parse(body),properties:JSON.parse(properties)});}
export function validateEvidenceIds(answer:Answer,issued:EvidencePacket[]){
 const ids=new Set(issued.map(p=>p.id));
 if(answer.procedurePlan?.steps.some(step=>step.evidenceIds.some(e=>!ids.has(e))||step.verification.kind==='owning-source'&&!ids.has(step.verification.evidenceId)))throw new ApiProblem(409,'INVALID_MODEL_EVIDENCE','The procedure cited an unissued source.');
 if(answer.hypothesisAssessment?.evidenceIds.some(e=>!ids.has(e))||answer.researchPlan?.analyses.some(a=>a.evidenceIds.some(e=>!ids.has(e))))throw new ApiProblem(409,'INVALID_MODEL_EVIDENCE','Research cited evidence that was not issued.');
 for(const statement of [...answer.statements,...answer.proposedChanges]){
  if(statement.evidenceIds.some(id=>!ids.has(id)))throw new ApiProblem(409,'INVALID_MODEL_EVIDENCE','The model cited evidence that was not issued.');
  if('kind'in statement&&statement.kind==='observation'&&!statement.evidenceIds.length)throw new ApiProblem(409,'UNSOURCED_OBSERVATION','An observation requires an issued source.');
 }
}
