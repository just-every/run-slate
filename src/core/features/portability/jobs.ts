import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requestHash,mutationGuard,freshProofGuard} from '../../app/operations';
import {createUlid} from '../../shared/ulid';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {requireExportCoverage} from './coverage';
import {byteHash} from './archive';
import {prepareRestore} from './restore-plan';
import {runWorkspaceExport} from './export-run';
import {exportAdmission} from './export-admission';
import {runWorkspaceRestore} from './restore-run';
import {cleanupJob,drainJobs,failJob} from './jobs-cleanup';
import {authorizeJob,envelope,readJob,clock,leaseDeadline,retentionDeadline,identityGuard,aclGuard,reclaimUncommitted,type PortabilityJob} from './jobs-store';
export async function jobsBoundary(ctx:FeatureContext){ctx.authorizationEpoch=undefined;await requireWorkspaceOwner(ctx);await drainJobs(ctx);}
export async function getPortabilityJob(ctx:FeatureContext,id:string){await jobsBoundary(ctx);return envelope(await authorizeJob(ctx,await readJob(ctx,id)));}
export async function stagePortabilityJob(ctx:FeatureContext,kind:'export'|'restore',operationKey:string,bytes?:Uint8Array){
 if(!/^[A-Za-z0-9_.:-]{8,160}$/.test(operationKey))throw new ApiProblem(400,'INVALID_OPERATION_KEY','Supply an operation key of 8–160 safe characters.');
 await jobsBoundary(ctx);if(kind==='export')await requireExportCoverage(ctx);
 const hash=await requestHash({kind,archive:bytes?await byteHash(bytes):null});
 const lookup=()=>ctx.db.prepare('SELECT * FROM portability_jobs WHERE admission_workspace_id=? AND admission_actor_id=? AND operation_key=?').bind(ctx.actor.workspaceId,ctx.actor.id,operationKey).first<PortabilityJob>();
 const replay=async(row:PortabilityJob)=>{if(row.request_hash!==hash||row.kind!==kind)throw new ApiProblem(409,'OPERATION_KEY_CONFLICT','This operation key cannot be reused for different work.');return envelope(await authorizeJob(ctx,row));};
 const previous=await lookup();if(previous)return replay(previous);
 if(kind==='restore'){if(!bytes)throw new ApiProblem(400,'FILE_REQUIRED','Attach a Slate workspace archive.');await prepareRestore(ctx,bytes);}
 const id=createUlid(),now=clock(),source=kind==='restore'?`federation/staging/${id}/source.zip`:null,lease=kind==='restore'?createUlid():null;
 try{await ctx.db.batch([identityGuard(ctx),aclGuard(ctx),...(ctx.stepUp?[freshProofGuard(ctx)]:[]),
  ctx.db.prepare("INSERT INTO portability_jobs(id,kind,admission_workspace_id,admission_actor_id,operation_key,request_hash,status_workspace_id,status_actor_id,state,export_id,source_archive_key,planned_restore_id,source_ready,lease_id,lease_until,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,'queued',?,?,?,?,?,?,?,?,?)").bind(id,kind,ctx.actor.workspaceId,ctx.actor.id,operationKey,hash,ctx.actor.workspaceId,ctx.actor.id,kind==='export'?id:null,source,kind==='restore'?createUlid():null,kind==='export'?1:0,lease,lease?leaseDeadline():null,now,now,retentionDeadline()),
  ...(kind==='export'?await exportAdmission(ctx,id,operationKey,now):[])
 ]);}catch(error){const raced=await lookup();if(raced)return replay(raced);throw error;}
 const job=(await readJob(ctx,id))!;
 if(source){try{
  await ctx.files.put(source,bytes! as Uint8Array<ArrayBuffer>);
  await requireWorkspaceOwner(ctx);
  await ctx.db.batch([identityGuard(ctx),aclGuard(ctx),mutationGuard(ctx.db,"SELECT state='queued' AND lease_id=? AND lease_until>? FROM portability_jobs WHERE id=?",[lease,clock(),id]),ctx.db.prepare('UPDATE portability_jobs SET source_ready=1,lease_id=NULL,lease_until=NULL WHERE id=?').bind(id)]);
 }catch{
  // A lost staging acknowledgement must not erase the durable winning source.
  const witness=await readJob(ctx,id);
  if(witness?.source_ready&&witness.state!=='failed')return envelope(witness);
  await reclaimUncommitted(ctx,source);
  await failJob(ctx,job,'STAGING_FAILED','The archive could not be durably staged. Use a fresh operation key.');
 }}
 const final=await readJob(ctx,id);if(!final)throw new ApiProblem(404,'JOB_EXPIRED','The operation receipt expired.');return envelope(final);
}
export async function runPortabilityJob(ctx:FeatureContext,id:string){
 await jobsBoundary(ctx);let job=await authorizeJob(ctx,await readJob(ctx,id));
 if(job.state!=='queued')return envelope(job);
 if(!job.source_ready)throw new ApiProblem(409,'STAGING_IN_PROGRESS','The source archive is still being staged.');
 const lease=createUlid(),now=clock();
 const claimed=await ctx.db.prepare("UPDATE portability_jobs SET state='running',lease_id=?,lease_until=?,started_at=?,updated_at=? WHERE id=? AND state='queued' AND source_ready=1 AND expires_at>?").bind(lease,leaseDeadline(),now,now,id,now).run();
 if(!claimed.meta.changes)return envelope(await authorizeJob(ctx,await readJob(ctx,id)));
 job=(await readJob(ctx,id))!;
 try{
  if(job.kind==='export'){await ctx.db.prepare("UPDATE federation_exports SET state='running',updated_at=? WHERE id=? AND state='queued'").bind(now,id).run();await runWorkspaceExport(ctx,job);}
  else await runWorkspaceRestore(ctx,job);
 }catch(error){
  // A batch can commit while its acknowledgement is lost. Never delete before this witness read.
  const witness=await readJob(ctx,id);
  if(witness?.state==='completed'){await cleanupJob(ctx,id);return envelope(witness);}
  const code=error instanceof ApiProblem?error.code:job.kind==='export'?'EXPORT_FAILED':'RESTORE_FAILED';
  const messages:Record<string,string>={
   EXPORT_COMMIT_FAILED:'The workspace archive could not be committed. No download was published.',
   RESTORE_COMMIT_FAILED:'The staged workspace records could not be published. The destination was left unchanged.',
   MISSING_EXPORT_FILE:'A referenced original file is missing. Restore the original file before exporting again.',
   MISSING_RESTORE_SOURCE:'The staged archive is unavailable. Choose the archive again to start a new restore.',
   STAGED_ARCHIVE_CHANGED:'The staged archive no longer matches the admitted archive. Choose the original archive again.',
   RESTORE_NOT_EMPTY:'The destination contains existing data. Use an empty deployment for restoration.',
   AUTHORITY_CHANGED:'Workspace access changed during the transfer. Review current access before starting again.',
   ARCHIVE_TOO_LARGE:'The archive exceeds the supported transfer size.',
   INTERRUPTED:'The transfer lost its active worker claim before completion.',
  };
  const message=messages[code]??(job.kind==='export'
   ?'The workspace export failed while preparing its archive. No download was published.'
   :'The workspace restore failed before publication. No restored workspace was published.');
  await failJob(ctx,job,code,message);
  const failed=await readJob(ctx,id);if(!failed)throw new ApiProblem(404,'JOB_EXPIRED','The operation receipt expired.');return envelope(failed);
 }
 await cleanupJob(ctx,id);
 const final=await readJob(ctx,id);if(!final)throw new ApiProblem(404,'JOB_EXPIRED','The operation receipt expired.');return envelope(final);
}
