import {qualifiedRoute} from './route-evaluation';
import { z } from 'zod';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { commitOperation } from '../../app/operations';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { revision } from './persistence';
import type { ModelRoute } from './provider';
export const modelPolicySchema=z.object({routes:z.array(z.object({provider:z.enum(['openai','local-codex']),model:z.string().min(1),role:z.enum(['frontier','fast']),accountingUnit:z.enum(['usd-micros','tokens']).optional(),inputMicrosPerMillion:z.number().int().positive(),outputMicrosPerMillion:z.number().int().positive(),maxRunMicros:z.number().int().positive(),monthlyMicros:z.number().int().positive(),tasks:z.array(z.string()),evaluationId:z.string().min(1)}).strict()).min(1).max(10),attentionBudget:z.number().int().nonnegative()}).strict();
export async function setModelPolicy(ctx:FeatureContext,input:{operationKey:string;policy:z.infer<typeof modelPolicySchema>}){
 const policy=modelPolicySchema.parse(input.policy);if(!policy.routes.some(r=>r.role==='frontier'))throw new ApiProblem(400,'FRONTIER_REQUIRED','A frontier route is required for direct investigation and audits.');
 return commitOperation(ctx,{operationKey:input.operationKey,action:'ai.model-policy',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>({entity:{id:ctx.actor.workspaceId,kind:'model-policy',revisionId},value:{revisionId,policy},statements:[ctx.db.prepare('INSERT INTO intelligence_model_policy(workspace_id,revision_id,policy_json,owner_id,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET revision_id=excluded.revision_id,policy_json=excluded.policy_json,owner_id=excluded.owner_id,updated_at=excluded.updated_at').bind(ctx.actor.workspaceId,revisionId,JSON.stringify(policy),ctx.actor.id,ctx.now),revision(ctx,revisionId,'model-policy',ctx.actor.workspaceId,policy)]})});
}
export async function chooseRoute(ctx:FeatureContext,task:string,direct:boolean):Promise<{route:ModelRoute;reason:string}>{
 const row=await ctx.db.prepare('SELECT policy_json FROM intelligence_model_policy WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{policy_json:string}>();
 if(!row)throw new ApiProblem(503,'MODEL_POLICY_UNAVAILABLE','The owner has not configured model rates, ceilings and evaluated task routes.');
 const policy=modelPolicySchema.parse(JSON.parse(row.policy_json));
 const frontier=direct||task!=='routing';
 const candidates=policy.routes.filter(r=>r.role===(frontier?'frontier':'fast')&&r.tasks.includes(task));
 const measured=[];for(const route of candidates){const evidence=await qualifiedRoute(ctx,route,task);if(evidence)measured.push({route,...evidence});}
 if(!measured.length)throw new ApiProblem(503,'MODEL_ROUTE_UNQUALIFIED','No current, source-readable measured evaluation qualifies this task and exact model.');
 measured.sort((a,b)=>b.fit-a.fit||a.meanCostMicros-b.meanCostMicros);
 return {route:measured[0]!.route,reason:direct?'qualified-frontier-bypass':frontier?'measured-reasoning-fit':'measured-semantic-routing'};
}
