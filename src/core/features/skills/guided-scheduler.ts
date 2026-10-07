import type {AppBindings} from '../../app/types';
import {audienceContext} from '../ai/evidence';
import {verifyGuidedStep} from './guided';
import {ApiProblem} from '../../app/problems';
export async function scheduleGuidedTasks(env:AppBindings,now:string){
 const rows=await env.DB.prepare("SELECT t.id AS task_id,t.workspace_id,t.owner_id,s.id AS step_id FROM intelligence_guided_tasks t JOIN intelligence_guided_steps s ON s.task_id=t.id WHERE t.state='active' AND s.state='pending' AND (NOT json_valid(s.verification_json) OR json_extract(CASE WHEN json_valid(s.verification_json) THEN s.verification_json ELSE '{}' END,'$.kind')='owning-source') ORDER BY t.created_at,s.ordinal LIMIT 30").all<{task_id:string;workspace_id:string;owner_id:string;step_id:string}>();
 for(const row of rows.results){const base={db:env.DB,files:env.FILES,jobs:env.JOBS,now,sourceSecret:env.CONNECTOR_CREDENTIALS_KEY,actor:{id:row.owner_id,workspaceId:row.workspace_id,workspaceName:'',displayName:'',email:'',initials:'',role:'member' as const}};try{const ctx=await audienceContext(base,row.owner_id);await verifyGuidedStep(ctx,{taskId:row.task_id,stepId:row.step_id,operationKey:`guided-owning-check:${row.step_id}`});}catch(error){if(!(error instanceof ApiProblem))throw error;/* Pending authoritative state stays pending; never substitute human completion. */}}
}
