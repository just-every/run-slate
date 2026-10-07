import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel } from '../sharing/current-access';
import { resolveEvidence } from '../ai/evidence';
import type { EvidenceInput } from '../ai/contracts';
import {skillDefinitionSchema} from './definition';
import {requireSkillDefinitionDisclosure} from './disclosure';
export {skillDefinitionSchema,type SkillDefinition} from './definition';
export async function requireActiveSkill(ctx:FeatureContext,versionId:string,refs:EvidenceInput[],audience:string[],cost:number){
 const row=await ctx.db.prepare('SELECT v.*,s.page_id,s.owner_id,s.current_revision_id FROM intelligence_skill_versions v JOIN intelligence_skills s ON s.id=v.skill_id WHERE v.id=? AND s.workspace_id=?').bind(versionId,ctx.actor.workspaceId).first<{id:string;state:string;definition_json:string;page_id:string;owner_id:string;current_revision_id:string;authority_id:string|null}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');await requirePageLevel(ctx,row.page_id,'view');
 if(row.state!=='active'||row.current_revision_id!==versionId)throw new ApiProblem(409,'SKILL_CHANGED','The pinned skill cannot start or resume work. Record continuation authority or start a successor.');
 if(!row.authority_id)throw new ApiProblem(403,'SKILL_ACTIVATION_REQUIRED','Activate this evaluated revision with fresh owner authority.');
 if(row.authority_id&&!row.authority_id.startsWith('member:')){const live=await ctx.db.prepare('SELECT id FROM intelligence_grants WHERE id=? AND revoked_at IS NULL AND expires_at>?').bind(row.authority_id,ctx.now).first();if(!live)throw new ApiProblem(403,'SKILL_AUTHORITY_REVOKED','The standing activation grant has expired or been revoked.');}
 const def=skillDefinitionSchema.parse(JSON.parse(row.definition_json));
 if(cost>def.maxCostMicros||audience.some(x=>!def.audience.includes(x))||refs.some(x=>!def.refs.some(y=>y.kind===x.kind&&y.sourceId===x.sourceId&&y.revisionId===x.revisionId&&y.passageId===x.passageId)))throw new ApiProblem(403,'SKILL_SCOPE_MISMATCH','The run exceeds the exact skill revision.');
 await requireSkillDefinitionDisclosure(ctx,def,audience,{current:true});return def;
}
export async function requirePinnedSkillContinuation(ctx:FeatureContext,run:{id:string;skill_revision_id:string|null;refs_json:string;audience_json:string;reserved_micros:number},grantId:string){
 if(!run.skill_revision_id)throw new ApiProblem(400,'NO_PINNED_SKILL','This run has no pinned skill.');
 const row=await ctx.db.prepare('SELECT v.definition_json,v.state,s.page_id FROM intelligence_skill_versions v JOIN intelligence_skills s ON s.id=v.skill_id WHERE v.id=? AND s.workspace_id=?').bind(run.skill_revision_id,ctx.actor.workspaceId).first<{definition_json:string;state:string;page_id:string}>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');await requirePageLevel(ctx,row.page_id,'view');
 const def=skillDefinitionSchema.parse(JSON.parse(row.definition_json));const refs:EvidenceInput[]=JSON.parse(run.refs_json),audience:string[]=JSON.parse(run.audience_json);if(run.reserved_micros>def.maxCostMicros||audience.some(x=>!def.audience.includes(x))||refs.some(x=>!def.refs.some(y=>y.kind===x.kind&&y.sourceId===x.sourceId&&y.revisionId===x.revisionId&&y.passageId===x.passageId)))throw new ApiProblem(403,'SKILL_SCOPE_MISMATCH','The continuation exceeds the exact pinned definition.');const {requireGrant}=await import('../effects/grants');await requireGrant(ctx,grantId,{kind:'continuation',operation:'run.continue',target:run.id,sourceIds:def.refs.map(r=>r.sourceId),audience:JSON.parse(run.audience_json),costMicros:run.reserved_micros,conditions:{skillRevisionId:run.skill_revision_id}});await requireSkillDefinitionDisclosure(ctx,def,audience,{current:true,extraRefs:refs});return def;
}
export async function requireEvaluationSkill(ctx:FeatureContext,revisionId:string,caseSetId:string,question:string,refs:EvidenceInput[]){
 const row=await ctx.db.prepare('SELECT v.state,v.definition_json,s.page_id,c.cases_json,c.source_refs_json,c.cutoff,c.execution_json FROM intelligence_skill_versions v JOIN intelligence_skills s ON s.id=v.skill_id JOIN intelligence_evaluation_cases c ON c.skill_revision_id=v.id WHERE v.id=? AND c.id=? AND s.workspace_id=?').bind(revisionId,caseSetId,ctx.actor.workspaceId).first<{state:string;definition_json:string;page_id:string;cases_json:string;source_refs_json:string;cutoff:string;execution_json:string}>();
 if(!row||row.state!=='draft')throw new ApiProblem(409,'EVALUATION_DRAFT_REQUIRED','A frozen draft evaluation is required.');
 await requirePageLevel(ctx,row.page_id,'edit');
 if(JSON.parse(row.execution_json).recoveryPausedAt)throw new ApiProblem(409,'RESTORED_AUTHORITY_REQUIRED','Prepare a fresh evaluation after restoring this workflow.');
 if(!JSON.parse(row.cases_json).some((c:{question:string})=>c.question===question)||JSON.stringify(JSON.parse(row.source_refs_json))!==JSON.stringify(refs))throw new ApiProblem(409,'EVALUATION_CASE_CHANGED','The evaluation must use the exact frozen question and source packet.');
 await resolveEvidence(ctx,refs,[ctx.actor.id],{cutoff:row.cutoff});
 return requireSkillDefinitionDisclosure(ctx,JSON.parse(row.definition_json),[ctx.actor.id],{cutoff:row.cutoff,extraRefs:refs});
}
