import {refineRun,refineRunSchema} from '../runs/refinement';
import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requestSchema,evidenceSchema} from '../ai/contracts';
import {resolveEvidence} from '../ai/evidence';
import {startRun,controlRun,reviewRun,startSuccessor} from '../runs/service';
import {acceptRunChanges,acceptChangesSchema} from '../runs/acceptance';
import {requireRun} from '../runs/repository';
import {runView} from '../runs/view';
import {effectSchema,prepareEffect,dispatchEffect,reconcileEffect,requireEffect} from '../effects/service';
import {inquiryView,requireInquiry} from '../inquiries/service';
import {authorizeAgentTool,credentialFromHeaders} from './credentials';
const control=z.object({id:z.string(),operationKey:z.string(),expectedRevisionId:z.string()}).strict();
export const toolSchemas={read_evidence:z.object({refs:z.array(evidenceSchema).min(1),audience:z.array(z.string()).min(1)}).strict(),ask:requestSchema,run_status:z.object({id:z.string()}).strict(),pause_run:control.extend({reason:z.string().optional()}),resume_run:control.extend({continuationGrantId:z.string().optional()}),cancel_run:control.extend({reason:z.string().optional()}),refine_run:refineRunSchema.extend({id:z.string()}),review_run:control.extend({outcome:z.enum(['accepted','discarded'])}),accept_changes:acceptChangesSchema.extend({id:z.string()}),successor_run:requestSchema.extend({id:z.string()}),prepare_effect:effectSchema,dispatch_effect:z.object({id:z.string()}).strict(),reconcile_effect:z.object({id:z.string()}).strict(),inquiry_status:z.object({id:z.string()}).strict()};
export async function invokeAgentTool(ctx:FeatureContext,headers:Headers,name:string,raw:unknown,provider:{apiKey?:string;localUrl?:string;localToken?:string}){
 const schema=toolSchemas[name as keyof typeof toolSchemas];if(!schema)throw new ApiProblem(400,'UNKNOWN_TOOL','Unknown semantic tool.');const parsed=schema.safeParse(raw);if(!parsed.success)throw new ApiProblem(400,'INVALID_TOOL_INPUT','Invalid semantic tool arguments.');
 if(name==='read_evidence'){const a=toolSchemas.read_evidence.parse(raw);await authorizeAgentTool(ctx,headers,name,a.refs.map(r=>r.sourceId),a.audience);return resolveEvidence(ctx,a.refs,a.audience);}
 if(name==='ask'){const a=requestSchema.parse(raw);await authorizeAgentTool(ctx,headers,name,a.refs.map(r=>r.sourceId),a.audience??[ctx.actor.id]);const credential=await credentialFromHeaders(ctx.db,headers,ctx.now);return startRun({...ctx,...(credential?{agentCredentialId:credential.id}:{})},a,provider);}
 if(name==='prepare_effect'){const a=effectSchema.parse(raw),run=await requireRun(ctx,a.runId,true);await authorizeAgentTool(ctx,headers,name,JSON.parse(run.refs_json).map((r:{sourceId:string})=>r.sourceId),JSON.parse(run.audience_json),a.grantId);return prepareEffect(ctx,a);}
 const a=parsed.data as {id:string;operationKey?:string;expectedRevisionId?:string};
 if(name==='inquiry_status'){const q=await requireInquiry(ctx,a.id);await authorizeAgentTool(ctx,headers,name,JSON.parse(q.refs_json).map((r:{sourceId:string})=>r.sourceId),JSON.parse(q.audience_json));return inquiryView(ctx,a.id);}
 if(name==='dispatch_effect'||name==='reconcile_effect'){const effect=await requireEffect(ctx,a.id),run=await requireRun(ctx,effect.run_id);await authorizeAgentTool(ctx,headers,name,JSON.parse(run.refs_json).map((r:{sourceId:string})=>r.sourceId),JSON.parse(run.audience_json),effect.grant_id);return name==='dispatch_effect'?dispatchEffect(ctx,a.id):reconcileEffect(ctx,a.id);}
 const run=await requireRun(ctx,a.id);await authorizeAgentTool(ctx,headers,name,JSON.parse(run.refs_json).map((r:{sourceId:string})=>r.sourceId),JSON.parse(run.audience_json));if(name==='run_status')return runView(ctx,a.id);
 if(name==='refine_run'){const {id,...input}=toolSchemas.refine_run.parse(raw);const credential=await credentialFromHeaders(ctx.db,headers,ctx.now);return refineRun({...ctx,...(credential?{agentCredentialId:credential.id}:{})},id,input,provider);}
 if(name==='review_run')return reviewRun(ctx,toolSchemas.review_run.parse(raw));
 if(name==='accept_changes'){const {id,...input}=toolSchemas.accept_changes.parse(raw);await authorizeAgentTool(ctx,headers,name,input.selections.map(s=>s.pageId),JSON.parse(run.audience_json));return acceptRunChanges(ctx,id,input);}
 if(name==='successor_run'){const {id,...input}=toolSchemas.successor_run.parse(raw);await authorizeAgentTool(ctx,headers,name,input.refs.map(r=>r.sourceId),input.audience??[ctx.actor.id]);const credential=await credentialFromHeaders(ctx.db,headers,ctx.now);return startSuccessor({...ctx,...(credential?{agentCredentialId:credential.id}:{})},id,input,provider);}
 return controlRun(ctx,{...parsed.data as z.infer<typeof control>&{reason?:string;continuationGrantId?:string},action:name==='pause_run'?'pause':name==='resume_run'?'resume':'cancel'});
}
export const toolCatalogue=()=>Object.entries(toolSchemas).map(([name,schema])=>({name,description:`Slate authorized ${name.replaceAll('_',' ')}; current source, audience, grant and receipt checks apply.`,inputSchema:z.toJSONSchema(schema,{target:'draft-7'})}));
