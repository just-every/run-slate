import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import {createUlid} from '../../shared/ulid';
import {requireExportCoverage} from '../portability/coverage';
import {writeWorkspaceArchive} from '../portability/archive-stream';
import {hashStream} from '../portability/stream-hash';
import {notificationStatements} from '../notifications/events';
import {processNotificationOutbox} from '../notifications/outbox';
import {transport} from './configuration';
import {requireDestination,type BackupDestinationRow,type BackupRunRow} from './store';
const readRun=(ctx:FeatureContext,id:string)=>ctx.db.prepare('SELECT * FROM backup_runs WHERE id=?').bind(id).first<BackupRunRow>();
/** Durable period admission is never reclaimed: an interrupted run fails safely rather than uploading twice. */
export async function runBackup(ctx:FeatureContext,row:BackupDestinationRow,period:string,secret:string){
 const id=createUlid(),key=`${row.prefix?row.prefix+'/':''}slate-backup-${ctx.now.replace(/[:.]/g,'-')}-${id}.zip`,archiveKey=`backups/staging/${id}.zip`;
 const admitted=await ctx.db.prepare("INSERT OR IGNORE INTO backup_runs(id,destination_id,period,state,object_key,archive_key,started_at) VALUES(?,?,?,'running',?,?,?)").bind(id,row.id,period,key,archiveKey,ctx.now).run();
 if(!admitted.meta.changes)return (await ctx.db.prepare('SELECT * FROM backup_runs WHERE destination_id=? AND period=?').bind(row.id,period).first<BackupRunRow>())!;
 const guard=async()=>{const current=await requireDestination(ctx,row.id);if(current.credential_ciphertext!==row.credential_ciphertext||(await readRun(ctx,id))?.state!=='running')throw new ApiProblem(409,'BACKUP_INTERRUPTED','The backup run no longer has authority.');};
 try{
  await requireExportCoverage(ctx);const epoch=ctx.authorizationEpoch;
  const current=async()=>{await guard();ctx.authorizationEpoch=undefined;await requireExportCoverage(ctx);if(ctx.authorizationEpoch!==epoch)throw new ApiProblem(409,'AUTHORITY_CHANGED','Workspace access changed during backup.');};
  const archive=await writeWorkspaceArchive(ctx,archiveKey,current);await current();
  const object=await ctx.files.get(archiveKey);if(!object)throw new ApiProblem(409,'BACKUP_ARCHIVE_MISSING','The complete archive is unavailable.');
  const s3=await transport(ctx,row,secret,current);await s3.upload(key,object);await current();
  const response=await s3.read(key);if(!response.body)throw new ApiProblem(409,'BACKUP_VERIFY_FAILED','The stored backup could not be verified.');
  const stored=await hashStream(response.body);if(stored.size!==archive.size||stored.sha256!==archive.sha256)throw new ApiProblem(409,'BACKUP_VERIFY_FAILED','The stored backup did not match the complete archive.');
  await current();await ctx.db.batch([mutationGuard(ctx.db,"SELECT state='connected' AND credential_ciphertext=? FROM backup_destinations WHERE id=?",[row.credential_ciphertext,row.id]),mutationGuard(ctx.db,"SELECT state='running' FROM backup_runs WHERE id=?",[id]),ctx.db.prepare("UPDATE backup_runs SET state='succeeded',size_bytes=?,sha256=?,verified_at=?,finished_at=? WHERE id=?").bind(stored.size,stored.sha256,ctx.now,ctx.now,id),ctx.db.prepare('UPDATE backup_destinations SET last_success=?,last_failure=NULL,last_failure_code=NULL,updated_at=? WHERE id=?').bind(ctx.now,ctx.now,row.id)]);
  // Delete exact receipt keys only. The buyer's other objects and failed/unverified writes are untouched.
  const old=(await ctx.db.prepare("SELECT id,object_key FROM backup_runs WHERE destination_id=? AND state='succeeded' AND verified_at IS NOT NULL AND deleted_at IS NULL ORDER BY started_at DESC,id DESC LIMIT -1 OFFSET ?").bind(row.id,row.retention).all<{id:string;object_key:string}>()).results;
  const retentionS3=await transport(ctx,row,secret);for(const prior of old){await retentionS3.remove(prior.object_key);await ctx.db.prepare('UPDATE backup_runs SET deleted_at=? WHERE id=?').bind(ctx.now,prior.id).run();}
 }catch(error){const witness=await readRun(ctx,id);await failBackup(ctx,row,id,witness?.state==='succeeded'?'BACKUP_RETENTION_FAILED':error instanceof ApiProblem?error.code:'BACKUP_FAILED');}
 finally{await ctx.files.delete(archiveKey);await ctx.db.prepare('UPDATE backup_runs SET archive_key=NULL WHERE id=?').bind(id).run();}
 return (await readRun(ctx,id))!;
}
export async function failBackup(ctx:FeatureContext,row:BackupDestinationRow,id:string,code:string){
 const owners=(await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND role='owner' AND status='active' AND member_kind='member'").bind(row.workspace_id).all<{id:string}>()).results.map(x=>x.id);
 const safeCodes=new Set(['BACKUP_RETENTION_FAILED','EXPORT_SCOPE_INCOMPLETE','BACKUP_DESTINATION_FORBIDDEN','BACKUP_PROVIDER_FAILED','BACKUP_VERIFY_FAILED','BACKUP_OBJECT_CONFLICT','BACKUP_INTERRUPTED','BACKUP_DISCONNECTED','ARCHIVE_TOO_LARGE','AUTHORITY_CHANGED','MISSING_EXPORT_FILE']);const safe=safeCodes.has(code)?code:'BACKUP_FAILED';
 await ctx.db.batch([ctx.db.prepare("UPDATE backup_runs SET state='failed',error_code=?,finished_at=? WHERE id=? AND state='running'").bind(safe,ctx.now,id),ctx.db.prepare('UPDATE backup_destinations SET last_failure=?,last_failure_code=?,updated_at=? WHERE id=?').bind(ctx.now,safe,ctx.now,row.id),...notificationStatements(ctx,{id:`backup-failed:${id}`,event:'backup-failed',actorId:null,recipientIds:owners,detail:{backupFailure:{destinationId:row.id,runId:id,code:safe}}})]);
 await processNotificationOutbox(ctx);
}
