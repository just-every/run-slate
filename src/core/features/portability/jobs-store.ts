import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {requireExportCoverage} from './coverage';
export type JobState='queued'|'running'|'completed'|'failed';
export interface PortabilityJob {
 id:string;kind:'export'|'restore';admission_workspace_id:string;admission_actor_id:string;
 operation_key:string;request_hash:string;status_workspace_id:string;status_actor_id:string;
 state:JobState;export_id:string|null;source_archive_key:string|null;planned_restore_id:string|null;
 source_ready:number;counts_json:string;report_json:string;cleanup_json:string;
 lease_id:string|null;lease_until:string|null;created_at:string;updated_at:string;
 started_at:string|null;completed_at:string|null;expires_at:string;
}
export interface JobEnvelope {id:string;kind:PortabilityJob['kind'];state:JobState;counts:Record<string,number>;report:{code?:string;message?:string};createdAt:string;updatedAt:string;startedAt?:string;completedAt?:string;downloadPath?:string;restoreId?:string;reconnect?:string[]}
export const reconnect=['Provider credentials are excluded. Reconnect all sources, chat destinations, identity providers, agents and model accounts. Imported automation, AI and guided work stay inactive. Skills retain evaluations but need fresh owner activation; trials need fresh authorization. External effects never replay.'];
export const clock=()=>new Date().toISOString();
export const leaseDeadline=()=>new Date(Date.now()+15*60*1000).toISOString();
export const retentionDeadline=()=>new Date(Date.now()+7*86400000).toISOString();
export const readJob=(ctx:FeatureContext,id:string)=>ctx.db.prepare('SELECT * FROM portability_jobs WHERE id=?').bind(id).first<PortabilityJob>();
export function envelope(row:PortabilityJob):JobEnvelope{return {id:row.id,kind:row.kind,state:row.state,counts:JSON.parse(row.counts_json),report:JSON.parse(row.report_json),createdAt:row.created_at,updatedAt:row.updated_at,...(row.started_at?{startedAt:row.started_at}:{}),...(row.completed_at?{completedAt:row.completed_at}:{}),...(row.state==='completed'?(row.kind==='export'?{downloadPath:`/api/exports/${row.id}/download`}:{restoreId:row.planned_restore_id!,reconnect}):{})};}
export async function authorizeJob(ctx:FeatureContext,row:PortabilityJob|null){
 await requireWorkspaceOwner(ctx);
 if(!row||row.status_workspace_id!==ctx.actor.workspaceId||row.status_actor_id!==ctx.actor.id)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 if(row.kind==='export')await requireExportCoverage(ctx);
 return row;
}
export function claimGuard(ctx:FeatureContext,job:PortabilityJob){return mutationGuard(ctx.db,"SELECT state='running' AND lease_id=? AND lease_until>? AND expires_at>? FROM portability_jobs WHERE id=?",[job.lease_id,clock(),clock(),job.id]);}
export function identityGuard(ctx:FeatureContext){return mutationGuard(ctx.db,"SELECT role='owner' AND status='active' AND member_kind='member' FROM members WHERE id=? AND workspace_id=?",[ctx.actor.id,ctx.actor.workspaceId]);}
export function aclGuard(ctx:FeatureContext){return mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[ctx.authorizationEpoch!]);}
/** Journal BEFORE each put. A lost put response still has a durable cleanup address. */
export async function trackPut(ctx:FeatureContext,job:PortabilityJob,key:string){await ctx.db.batch([claimGuard(ctx,job),ctx.db.prepare("UPDATE portability_jobs SET cleanup_json=json_insert(cleanup_json,'$[#]',?) WHERE id=?").bind(key,job.id)]);}
export async function assertClaim(ctx:FeatureContext,job:PortabilityJob){const row=await readJob(ctx,job.id);if(row?.state!=='running'||row.lease_id!==job.lease_id||!row.lease_until||row.lease_until<=clock())throw new ApiProblem(409,'INTERRUPTED','The operation claim has expired or was revoked.');}

/** A put returning after retention removed the receipt must still reclaim its own uncommitted key. */
export async function putTracked(ctx:FeatureContext,job:PortabilityJob,key:string,bytes:Uint8Array,beforePut?:()=>Promise<void>){
 await trackPut(ctx,job,key);
 if(beforePut)try{await beforePut();}catch(error){
  // No put has started, so this exact journal entry cannot have a late writer.
  await ctx.db.batch([claimGuard(ctx,job),ctx.db.prepare("UPDATE portability_jobs SET cleanup_json=(SELECT COALESCE(json_group_array(value),'[]') FROM json_each(cleanup_json) WHERE value<>?) WHERE id=?").bind(key,job.id)]);
  throw error;
 }
 try{await ctx.files.put(key,bytes as Uint8Array<ArrayBuffer>);await assertClaim(ctx,job);}
 catch(error){
  await reclaimUncommitted(ctx,key);
  throw error;
 }
}
export async function reclaimUncommitted(ctx:FeatureContext,key:string){
 await ctx.db.prepare('INSERT INTO content_media_cleanup(storage_key,created_at) VALUES (?,?) ON CONFLICT DO NOTHING').bind(key,clock()).run();
 try{await ctx.files.delete(key);if(!await ctx.files.head(key))await ctx.db.prepare('DELETE FROM content_media_cleanup WHERE storage_key=?').bind(key).run();}catch{/* The durable cleanup address survives worker loss. */}
}
