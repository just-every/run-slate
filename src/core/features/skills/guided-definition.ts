import {z} from 'zod';
import {canonicalNative} from '../connectors/native-effects';
import {ApiProblem} from '../../app/problems';
import type {FeatureContext} from '../../app/feature-context';
import {evidenceSchema,procedurePlanSchema,type RunRow} from '../ai/contracts';
export const verificationSchema=z.union([
 z.object({kind:z.literal('human-action'),memberId:z.string().min(1)}).strict(),
 z.object({kind:z.literal('owning-source'),connectionId:z.string().min(1),remoteId:z.string().min(1),expectedState:z.enum(['open','closed'])}).strict(),
 z.object({kind:z.literal('owning-source'),connectionId:z.string().min(1),remoteId:z.string().min(1),stateSchema:z.literal('crm.handoff-state/1'),expectedState:z.enum(['open','completed','cancelled'])}).strict(),
]);
export const guidedSchema=z.object({operationKey:z.string(),runId:z.string(),steps:z.array(z.object({instruction:z.string().min(1),refs:z.array(evidenceSchema).min(1),verification:verificationSchema}).strict()).min(1).max(50)}).strict();
export function persisted<T>(schema:z.ZodType<T>,raw:string):T{let value:unknown;try{value=JSON.parse(raw);}catch{throw new ApiProblem(409,'INVALID_GUIDED_DEFINITION','The stored guided definition is invalid.');}const result=schema.safeParse(value);if(!result.success)throw new ApiProblem(409,'INVALID_GUIDED_DEFINITION','The stored guided definition is invalid.');return result.data;}
export async function procedureSteps(ctx:FeatureContext,run:RunRow){
 if(run.kind!=='procedure'||!run.output_json||!['needs-review','completed'].includes(run.status))throw new ApiProblem(409,'PROCEDURE_REQUIRED','Generate a grounded procedure first.');
 const output=persisted(z.object({answer:z.object({procedurePlan:procedurePlanSchema})}),run.output_json);
 const refs=persisted(z.array(evidenceSchema),run.refs_json);
 const issued=(key:string)=>{if(!/^E[1-9][0-9]*$/.test(key)||!refs[Number(key.slice(1))-1])throw new ApiProblem(409,'INVALID_PROCEDURE','The procedure cited an unissued source.');return refs[Number(key.slice(1))-1]!;};
 const steps:z.infer<typeof guidedSchema>['steps']=[];
 for(const step of output.answer.procedurePlan.steps){
  const selected=step.evidenceIds.map(issued),verification=step.verification;
  if(verification.kind==='human-action'){steps.push({instruction:step.instruction+' '+verification.reason,refs:selected,verification:{kind:'human-action',memberId:ctx.actor.id}});continue;}
  const ref=issued(verification.evidenceId);if(ref.kind!=='source')throw new ApiProblem(409,'OWNING_SOURCE_REQUIRED','Verification requires an issued connected source.');
  const source=await ctx.db.prepare('SELECT s.connection_id,s.remote_id FROM federation_sources s JOIN federation_connections c ON c.id=s.connection_id WHERE s.id=? AND s.workspace_id=? AND c.member_id=? AND c.workspace_id=s.workspace_id').bind(ref.sourceId,ctx.actor.workspaceId,ctx.actor.id).first<{connection_id:string;remote_id:string}>();
  if(!source)throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The owning source is unavailable for this actor.');
  if(!selected.some(r=>JSON.stringify(r)===JSON.stringify(ref)))selected.push(ref);
  steps.push({instruction:step.instruction,refs:selected,verification:{kind:'owning-source',connectionId:source.connection_id,remoteId:source.remote_id,expectedState:verification.expectedState,...('stateSchema'in verification?{stateSchema:verification.stateSchema}:{})} as z.infer<typeof verificationSchema>});
 }
 return steps;
}
export async function requireGroundedSteps(ctx:FeatureContext,run:RunRow,steps:z.infer<typeof guidedSchema>['steps']){
 const expected=await procedureSteps(ctx,run);
 if(canonicalNative(expected)!==canonicalNative(steps))throw new ApiProblem(409,'INVALID_GUIDED_GROUNDING','Guided steps must match the procedure and its exact issued sources.');
}
