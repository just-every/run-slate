import {requireGovernance} from '../workspace/governance';
import {pageRow,writable} from '../pages/repository';
import {requireSkillRevisionDisclosure} from '../skills/disclosure';
import {recheckBudget} from '../ai/budget';
import {qualifiedRoute} from '../ai/route-evaluation';
import type {ModelRoute} from '../ai/provider';
import {requireWritingSelection} from '../ai/selection';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel, currentSubject } from '../sharing/current-access';
import { resolveEvidence } from '../ai/evidence';
import type { RunRow, EvidenceInput } from '../ai/contracts';
export async function requireRun(ctx:FeatureContext,runId:string,control=false):Promise<RunRow>{
 await currentSubject(ctx);
 const run=await ctx.db.prepare('SELECT * FROM intelligence_runs WHERE id=? AND workspace_id=?').bind(runId,ctx.actor.workspaceId).first<RunRow>();
 if(!run)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 if(control&&run.requester_id!==ctx.actor.id)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 if(run.page_id)await requirePageLevel(ctx,run.page_id,'view');
 const audience=JSON.parse(run.audience_json) as string[];
 if(run.requester_id!==ctx.actor.id&&!audience.includes(ctx.actor.id))throw new ApiProblem(404,'NOT_FOUND','Not found.');
 const readers=[...new Set([run.requester_id,...audience,ctx.actor.id])];
 if(run.skill_revision_id)await requireSkillRevisionDisclosure(ctx,run.skill_revision_id,readers,{extraRefs:JSON.parse(run.refs_json)});else await resolveEvidence(ctx,JSON.parse(run.refs_json) as EvidenceInput[],readers);
 return run;
}
export function requiresFreshRunAuthority(run:RunRow):boolean{
 return run.failure_reason==='RESTORED_AUTHORITY_REQUIRED'||!!JSON.parse(run.input_json).recoveryPausedAt;
}
export function requireFreshRunAuthority(run:RunRow){
 if(requiresFreshRunAuthority(run))throw new ApiProblem(409,'RESTORED_AUTHORITY_REQUIRED','Restored work requires a fresh authorized successor.');
}
export async function reauthorizeRun(ctx:FeatureContext,run:RunRow,current=true){
 requireFreshRunAuthority(run);
 await requireGovernance(ctx,'useAi',run.page_id);
 await currentSubject(ctx);await requirePageLevel(ctx,run.page_id,'view');
 if(run.kind==='edit'||JSON.parse(run.input_json).selection)writable(await pageRow(ctx,run.page_id));
 const enabled=await ctx.db.prepare('SELECT ai_enabled FROM workspaces WHERE id=?').bind(ctx.actor.workspaceId).first<{ai_enabled:number}>();if(!enabled?.ai_enabled)throw new ApiProblem(403,'AI_DISABLED','AI has been disabled by the owner.');
 const policy=await ctx.db.prepare('SELECT policy_json FROM intelligence_model_policy WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{policy_json:string}>();const allowed=policy?JSON.parse(policy.policy_json).routes as {provider:string;model:string}[]:[];if(run.provider!=='deterministic'&&!allowed.some(r=>r.provider===run.provider&&r.model===run.model))throw new ApiProblem(403,'MODEL_ROUTE_REVOKED','The owner removed this provider/model route.');
 if(run.provider!=='deterministic'){const stored=JSON.parse(run.input_json);const route=policy?JSON.parse(policy.policy_json).routes.find((r:ModelRoute)=>r.provider===run.provider&&r.model===run.model&&r.evaluationId===stored.route?.evaluationId&&r.tasks.includes(run.kind)):null;if(!route||!await qualifiedRoute(ctx,route,run.kind))throw new ApiProblem(403,'MODEL_ROUTE_REVOKED','The measured route is no longer qualified.');if(current)await recheckBudget(ctx,run,route);if(current&&stored.selection)await requireWritingSelection(ctx,stored.selection);}
 if(run.agent_credential_id){const credential=await ctx.db.prepare('SELECT id FROM intelligence_agent_credentials WHERE id=? AND subject_id=? AND revoked_at IS NULL AND expires_at>?').bind(run.agent_credential_id,run.requester_id,ctx.now).first();if(!credential)throw new ApiProblem(403,'AGENT_CREDENTIAL_REVOKED','The originating agent credential is no longer valid.');}
 const refs=JSON.parse(run.refs_json) as EvidenceInput[],audience=JSON.parse(run.audience_json) as string[];
 if(run.skill_revision_id){const def=await requireSkillRevisionDisclosure(ctx,run.skill_revision_id,audience,{extraRefs:refs,current});const closure=await resolveEvidence(ctx,[...def.refs,...refs],audience,{current});return closure.slice(def.refs.length).map((packet,index)=>({...packet,id:`E${index+1}`}));}
 return resolveEvidence(ctx,refs,audience,{current});
}
export async function listRuns(ctx:FeatureContext,pageId?:string,question?:string){
 await currentSubject(ctx);const rows=await ctx.db.prepare("SELECT id FROM intelligence_runs WHERE workspace_id=? AND (? IS NULL OR page_id=?) AND (? IS NULL OR json_extract(input_json,'$.question')=?) ORDER BY created_at DESC,id DESC LIMIT 100").bind(ctx.actor.workspaceId,pageId??null,pageId??null,question??null,question??null).all<{id:string}>();
 const visible:RunRow[]=[];for(const row of rows.results){try{visible.push(await requireRun(ctx,row.id));}catch(e){if(!(e instanceof ApiProblem)||![403,404].includes(e.status))throw e;}}
 return visible;
}
