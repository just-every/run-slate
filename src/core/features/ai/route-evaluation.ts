import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation} from '../../app/operations';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {evidenceSchema} from './contracts';
import {resolveEvidence} from './evidence';
import {id,revision} from './persistence';
import type {ModelRoute} from './provider';
/** Owner-imported measured results. Assertions retain exact supporting source revisions and receipts. */
export const routeEvaluationSchema=z.object({operationKey:z.string(),provider:z.enum(['openai','local-codex']),model:z.string().min(1),task:z.string().min(1),cutoff:z.iso.datetime(),expiresAt:z.iso.datetime(),minimumFit:z.number().min(0).max(1),cases:z.array(z.object({caseId:z.string().min(1),heldOut:z.literal(true),observedAt:z.iso.datetime(),passed:z.boolean(),costMicros:z.number().int().nonnegative(),elapsedMs:z.number().int().nonnegative(),receipt:z.string().min(1),refs:z.array(evidenceSchema).min(1)}).strict()).min(1).max(1000)}).strict();
export async function recordRouteEvaluation(ctx:FeatureContext,raw:z.infer<typeof routeEvaluationSchema>){
 const input=routeEvaluationSchema.parse(raw);
 if(input.cutoff>ctx.now||input.expiresAt<=ctx.now||new Set(input.cases.map(c=>c.caseId)).size!==input.cases.length||input.cases.some(c=>c.observedAt<input.cutoff||c.observedAt>ctx.now))throw new ApiProblem(400,'INVALID_ROUTE_EVALUATION','Declare unique held-out cases measured after the frozen cutoff and before now.');
 const fit=input.cases.filter(c=>c.passed).length/input.cases.length;
 return commitOperation(ctx,{operationKey:input.operationKey,action:'ai.route-evaluation',request:input,authorize:async()=>{await requireWorkspaceOwner(ctx);await resolveEvidence(ctx,input.cases.flatMap(c=>c.refs),[ctx.actor.id]);},prepare:async({revisionId})=>{const evaluationId=id();return {entity:{id:evaluationId,kind:'route-evaluation',revisionId},value:{id:evaluationId,fit,qualified:fit>=input.minimumFit,revisionId},statements:[ctx.db.prepare('INSERT INTO intelligence_route_evaluations(id,workspace_id,revision_id,provider,model,task,evidence_json,measured_fit,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(evaluationId,ctx.actor.workspaceId,revisionId,input.provider,input.model,input.task,JSON.stringify(input),fit,input.expiresAt,ctx.now),revision(ctx,revisionId,'route-evaluation',evaluationId,input)]};}});
}
export async function qualifiedRoute(ctx:FeatureContext,route:ModelRoute,task:string){
 const row=await ctx.db.prepare('SELECT evidence_json,measured_fit,expires_at,revoked_at FROM intelligence_route_evaluations WHERE id=? AND workspace_id=? AND provider=? AND model=? AND task=?').bind(route.evaluationId,ctx.actor.workspaceId,route.provider,route.model,task).first<{evidence_json:string;measured_fit:number;expires_at:string;revoked_at:string|null}>();
 if(!row||row.revoked_at||row.expires_at<=ctx.now)return null;
 const evidence=routeEvaluationSchema.parse(JSON.parse(row.evidence_json));
 if(row.measured_fit<evidence.minimumFit)return null;
 await resolveEvidence(ctx,evidence.cases.flatMap(c=>c.refs),[ctx.actor.id]);
 return {fit:row.measured_fit,meanCostMicros:evidence.cases.reduce((s,c)=>s+c.costMicros,0)/evidence.cases.length};
}
