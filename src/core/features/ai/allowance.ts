import {prepareAiEnableStatements} from '../workspace/settings';
import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation} from '../../app/operations';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {revision,json} from './persistence';
export const localAllowanceSchema=z.object({operationKey:z.string(),monthlyTokenAllowance:z.number().int().positive(),perRunTokenAllowance:z.number().int().positive(),acknowledgeProviderHasNoHardTokenCap:z.literal(true)}).strict();
/** Development only. This never configures or claims a metered API-dollar ceiling. */
export async function configureLocalAllowance(ctx:FeatureContext,input:z.infer<typeof localAllowanceSchema>,config:{provider?:string;model?:string;localUrl?:string;localToken?:string}){
 if(config.provider!=='local-codex'||!config.model||!config.localUrl||!config.localToken)throw new ApiProblem(503,'LOCAL_PROVIDER_UNAVAILABLE','Connect the local development provider first.');
 if(input.perRunTokenAllowance>input.monthlyTokenAllowance)throw new ApiProblem(400,'INVALID_ALLOWANCE','The per-run allowance cannot exceed the monthly allowance.');
 await requireWorkspaceOwner(ctx);
 const response=await fetch(`${config.localUrl}/v1/readiness`,{headers:{authorization:`Bearer ${config.localToken}`},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new ApiProblem(503,'LOCAL_EVALUATION_UNAVAILABLE','The current bridge has not completed its capability evaluation.');
 const evaluation=z.object({id:z.string(),model:z.string(),bridgeVersion:z.string(),completedAt:z.string(),status:z.literal('passed'),scope:z.literal('grounding-schema-and-capability-isolation'),receipts:z.array(z.unknown()).length(2),monetaryCost:z.null(),hardProviderCap:z.literal(false)}).parse(await response.json());
 if(evaluation.model!==config.model)throw new ApiProblem(409,'LOCAL_MODEL_CHANGED','The evaluated model differs from the configured model.');
 const policy={attentionBudget:10,routes:[{provider:'local-codex',model:config.model,role:'frontier',accountingUnit:'tokens',inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,maxRunMicros:input.perRunTokenAllowance,monthlyMicros:input.monthlyTokenAllowance,tasks:['answer','summary','difference','edit','investigation','procedure','routing'],evaluationId:evaluation.id}]};
 return commitOperation(ctx,{operationKey:input.operationKey,action:'ai.local-allowance',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>({entity:{id:ctx.actor.workspaceId,kind:'model-policy',revisionId},value:{enabled:true,accountingUnit:'tokens',monetaryCost:null,hardProviderCap:false,model:config.model,revisionId},statements:[...await prepareAiEnableStatements(ctx,true),ctx.db.prepare('INSERT INTO intelligence_model_policy(workspace_id,revision_id,policy_json,owner_id,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET revision_id=excluded.revision_id,policy_json=excluded.policy_json,owner_id=excluded.owner_id,updated_at=excluded.updated_at').bind(ctx.actor.workspaceId,revisionId,json(policy),ctx.actor.id,ctx.now),ctx.db.prepare("INSERT INTO intelligence_allowances(workspace_id,unit,monthly_units,per_run_units,owner_id,revision_id,created_at) VALUES(?,'tokens',?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET monthly_units=excluded.monthly_units,per_run_units=excluded.per_run_units,owner_id=excluded.owner_id,revision_id=excluded.revision_id").bind(ctx.actor.workspaceId,input.monthlyTokenAllowance,input.perRunTokenAllowance,ctx.actor.id,revisionId,ctx.now),revision(ctx,revisionId,'model-policy',ctx.actor.workspaceId,{...policy,evaluation,developmentOnly:true,providerHardCap:false})]})});
}
