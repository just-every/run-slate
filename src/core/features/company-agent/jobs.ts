import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import type {InvocationIdentity,CallResult} from '../../../../modules/agent-door/index.ts';
import {ToolRefusal} from '../../../../modules/agent-door/index.ts';
import {requestHash} from '../../app/request-hash';
import {nativeMember} from './people';
import {runtimeConfigFor} from '../../app/runtime-gate';
import {slateAgentDoor} from './index';
const identity=z.object({person:z.object({id:z.string().min(1)}).strict(),agent:z.object({id:z.string().min(1),name:z.string().min(1),specialist:z.string().nullable().optional()}).strict(),scopes:z.array(z.string()).max(1000),clientId:z.string().optional(),consent:z.string().optional(),operationId:z.string().optional()}).strict();
interface NativeJob {id:string;person_id:string;request_json:string;request_hash:string;state:string;result_json:string|null}
const canonicalRequest=(name:string,args:Record<string,unknown>,who:InvocationIdentity)=>({name,args,who:identity.parse(who)});

/** Only trusted native service bindings enqueue a principal. The consumer still
 * passes its saved scopes and originating consent through the shared door. */
export async function enqueueAgentJob(env:AppBindings,name:string,args:Record<string,unknown>,who:InvocationIdentity) {
 if(!name.startsWith('slate.')||typeof args.idempotency_key!=='string'||!args.idempotency_key||args.idempotency_key.length>200)throw new ToolRefusal('invalid_arguments');
 if(!await nativeMember(env.DB,who.person.id))throw new ToolRefusal('unauthenticated');
 const value=canonicalRequest(name,args,who),json=JSON.stringify(value);
 if(new TextEncoder().encode(json).length>128*1024)throw new ToolRefusal('body_too_large');
 const hash=await requestHash(value),id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO slate_agent_jobs(id,person_id,agent_id,public_key,request_json,request_hash,state,created_at) VALUES(?,?,?,?,?,?,'pending',?) ON CONFLICT(agent_id,public_key) DO NOTHING").bind(id,who.person.id,who.agent.id,args.idempotency_key,json,hash,new Date().toISOString()).run();
 const job=await env.DB.prepare('SELECT * FROM slate_agent_jobs WHERE agent_id=? AND public_key=?').bind(who.agent.id,args.idempotency_key).first<NativeJob>();
 if(!job||job.request_hash!==hash)throw new ToolRefusal('idempotency_conflict');
 if(job.state!=='complete')await env.JOBS.send({kind:'company-agent.invoke',id:job.id});
 return {id:job.id};
}
export async function agentJobResult(env:AppBindings,id:string,who:InvocationIdentity):Promise<CallResult|null> {
 const row=await env.DB.prepare('SELECT * FROM slate_agent_jobs WHERE id=? AND person_id=?').bind(id,who.person.id).first<NativeJob>();
 if(!row||!await nativeMember(env.DB,who.person.id))throw new ToolRefusal('job_not_found');
 const saved=JSON.parse(row.request_json) as ReturnType<typeof canonicalRequest>;
 if(await requestHash(saved.who)!==await requestHash(identity.parse(who)))throw new ToolRefusal('job_not_found');
 return row.result_json?JSON.parse(row.result_json):null;
}
export async function consumeAgentJob(env:AppBindings,body:unknown):Promise<boolean> {
 if(!body||typeof body!=='object'||!('kind'in body)||body.kind!=='company-agent.invoke')return false;
 const id='id'in body&&typeof body.id==='string'?body.id:null;if(!id)throw new ToolRefusal('invalid_arguments');
 const lease=crypto.randomUUID();
 const claim=await env.DB.prepare("UPDATE slate_agent_jobs SET state='running',lease_until=?,lease_id=? WHERE id=? AND (state='pending' OR state='running' AND lease_until<?)").bind(Date.now()+60_000,lease,id,Date.now()).run();
 if(!claim.meta.changes)return true;
 const row=await env.DB.prepare('SELECT * FROM slate_agent_jobs WHERE id=?').bind(id).first<NativeJob>();if(!row)return true;
 const saved=JSON.parse(row.request_json) as ReturnType<typeof canonicalRequest>;
 const origin=new URL(env.APP_URL!);
 const result=await (await slateAgentDoor(env,runtimeConfigFor(env,origin.hostname))).invoke(saved.name,saved.args,saved.who);
 await env.DB.prepare("UPDATE slate_agent_jobs SET state='complete',result_json=?,completed_at=?,lease_until=NULL,lease_id=NULL WHERE id=? AND state='running' AND lease_id=?").bind(JSON.stringify(result),new Date().toISOString(),id,lease).run();
 return true;
}
export async function recoverAgentJobs(env:AppBindings) {
 const rows=await env.DB.prepare("SELECT id FROM slate_agent_jobs WHERE state='pending' OR state='running' AND lease_until<? ORDER BY created_at LIMIT 100").bind(Date.now()).all<{id:string}>();
 for(const row of rows.results)await env.JOBS.send({kind:'company-agent.invoke',id:row.id});
}
