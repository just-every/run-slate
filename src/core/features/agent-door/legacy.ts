import {doorSchema} from './schema';
import {ToolRefusal,type ToolDefinition,type ToolContext} from '../../../../modules/agent-door/index.ts';
import type {AppBindings} from '../../app/types';
import {toolSchemas,invokeAgentTool} from '../external-agent/tools';
import {authorizeAgentTool,credentialFromHeaders,authenticateExternalAgent} from '../external-agent/credentials';
import {requireRun} from '../runs/repository';
import {requireEffect} from '../effects/service';
import {requireInquiry} from '../inquiries/service';
import {nativeContext,nativeCall,nativeJson} from './context';
import {mutationGuard} from '../../app/operations';
import {recordClasses} from './risk';
export const legacyNames:Record<string,string>={read_evidence:'slate.evidence.read',ask:'slate.runs.start',run_status:'slate.runs.read',pause_run:'slate.runs.pause',resume_run:'slate.runs.resume',cancel_run:'slate.runs.cancel',refine_run:'slate.runs.refine',review_run:'slate.runs.review',accept_changes:'slate.proposals.apply',successor_run:'slate.runs.successor',prepare_effect:'slate.effects.prepare',dispatch_effect:'slate.effects.dispatch',reconcile_effect:'slate.effects.reconcile',inquiry_status:'slate.inquiries.read'};
const readonly=new Set(['read_evidence','run_status','inquiry_status']);
export async function localAgent(env:AppBindings,request:Request){
 const credential=await credentialFromHeaders(env.DB,request.headers,new Date().toISOString());
 const sponsor=credential&&await authenticateExternalAgent(env.DB,request.headers);
 if(!credential||!sponsor)return null;
 const scope=JSON.parse(credential.scope_json) as {tools:string[]};
 return {sponsor:{id:sponsor.id},agent:{id:credential.id,name:'Slate agent',specialist:'wiki curator'},clientId:credential.id,scopes:scope.tools.filter(name=>legacyNames[name]).map(name=>'slate:legacy:'+name)};
}

async function legacyContext(env:AppBindings,ctx:ToolContext){
 const c={...await nativeContext(env,ctx),nativeAgentCredentialId:ctx.clientId,sourceSecret:env.CONNECTOR_CREDENTIALS_KEY};
 if(ctx.clientId){
  const credential=await env.DB.prepare('SELECT scope_json FROM intelligence_agent_credentials WHERE id=?').bind(ctx.clientId).first<{scope_json:string}>();
  c.operationStatements={before:[mutationGuard(env.DB,"SELECT EXISTS(SELECT 1 FROM intelligence_agent_credentials c JOIN members o ON o.id=c.owner_id WHERE c.id=? AND c.subject_id=? AND c.revoked_at IS NULL AND c.expires_at>? AND c.scope_json=? AND o.status='active' AND o.role='owner')",[ctx.clientId,ctx.person.id,c.now,credential?.scope_json??''])],after:[]};
 }
 return c;
}

/** Existing development-profile native jobs enter the same policy pipeline. */
export function legacyTools(env:AppBindings):ToolDefinition[]{
 return Object.entries(toolSchemas).filter(([name])=>name!=='review_run').map(([old,schema])=>({
  name:legacyNames[old]!,title:old.replaceAll('_',' '),description:'Development-profile native Slate job; exact original source, audience and effect grants still apply.',scope:'slate:legacy:'+old,readOnly:readonly.has(old),classes:old.includes('effect')?['standard','external','sensitive']:['standard','sensitive'],clauses:[old.includes('effect')?'EFFECT-001':old==='inquiry_status'?'INQ-001':old==='read_evidence'?'AI-004':'AGENT-001'],inputSchema:{type:'object',properties:{input:doorSchema(schema)},required:['input'],additionalProperties:false},outputSchema:old==='read_evidence'?{type:'array'}:{type:'object'},untrusted:true,
  classify:async(args,ctx,completed)=>nativeCall(async()=>{
   args=args.input as Record<string,unknown>;
   const c=await legacyContext(env,ctx);
   let record:unknown=args;
   if(old==='read_evidence'||old==='ask'){
    const a=args as {refs:{sourceId:string}[];audience?:string[]};await authorizeAgentTool(c,new Headers(),old,a.refs.map(r=>r.sourceId),a.audience??[ctx.person.id]);
   }else{
    const runId=old==='prepare_effect'?String(args.runId):old==='dispatch_effect'||old==='reconcile_effect'?(await requireEffect(c,String(args.id))).run_id:String(args.id);
    const row=old==='inquiry_status'?await requireInquiry(c,runId):await requireRun(c,runId);
    await authorizeAgentTool(c,new Headers(),old,JSON.parse(row.refs_json).map((r:{sourceId:string})=>r.sourceId),JSON.parse(row.audience_json),typeof args.grantId==='string'?args.grantId:undefined);record=row;
   }
   if(completed)return [...completed];
   return [...recordClasses(record),...(old==='dispatch_effect'?[{class:'external' as const,facts:{measure:1,counterparty:'known' as const}}]:[])];
  }),
  summary:async(args,ctx)=>({target:{id:String((args.input as Record<string,unknown>).id??(args.input as Record<string,unknown>).runId??ctx.person.id),name:old.replaceAll('_',' ')},items:[JSON.stringify(args)]}),
  run:async(args,ctx)=>nativeCall(async()=>({result:nativeJson(await invokeAgentTool(await legacyContext(env,ctx),new Headers(),old,args.input,{apiKey:env.AI_API_KEY,localUrl:env.AI_LOCAL_URL,localToken:env.AI_LOCAL_TOKEN}))})),
 }));
}
