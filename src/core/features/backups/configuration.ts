import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {encryptSecret,decryptSecret} from '../../platform/secrets/custody';
import {createUlid} from '../../shared/ulid';
import {scope,requireDestination,destinationView,type BackupDestinationRow} from './store';
import {BackupS3} from './s3';
const safeText=z.string().trim().min(1).max(120);
export const destinationInput=z.object({operationKey:z.string(),name:safeText,kind:z.enum(['s3','r2']),endpoint:z.string().url(),region:z.string().regex(/^[a-z0-9-]{1,60}$/),bucket:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),prefix:z.string().max(200).regex(/^[A-Za-z0-9_./-]*$/),accessKeyId:z.string().min(1).max(256),secretAccessKey:z.string().min(1).max(1024),schedule:z.enum(['nightly','weekly']),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),weekday:z.number().int().min(0).max(6),retention:z.number().int().min(1).max(365)}).strict();
function endpoint(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.port&&url.port!=='443'||!url.hostname.includes('.')||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local')||/^(?:\d|\[)/.test(url.hostname))throw new ApiProblem(400,'INVALID_BACKUP_ENDPOINT','Use a public HTTPS S3 endpoint without credentials, a path or query.');return url.origin;}
export async function addDestination(ctx:FeatureContext,key:string,input:z.infer<typeof destinationInput>){
 await requireWorkspaceOwner(ctx);if(!key||key.length<32)throw new ApiProblem(503,'CREDENTIAL_UNAVAILABLE','CONNECTOR_CREDENTIALS_KEY is required.');
 const origin=endpoint(input.endpoint),prefix=input.prefix.replace(/^\/+|\/+$/g,'');if(prefix.split('/').some(p=>p==='.'||p==='..'))throw new ApiProblem(400,'INVALID_BACKUP_PREFIX','Use a prefix without relative path segments.');
 const id=createUlid(),cipher=await encryptSecret(key,JSON.stringify({accessKeyId:input.accessKeyId,secretAccessKey:input.secretAccessKey}),scope({id,workspace_id:ctx.actor.workspaceId}));
 const result=await commitOperation(ctx,{operationKey:input.operationKey,action:'backup.configure',request:{...input,endpoint:origin},authorize:()=>requireWorkspaceOwner(ctx),prepare:async()=>({statements:[ctx.db.prepare("INSERT INTO backup_destinations(id,workspace_id,created_by_member_id,name,kind,endpoint,region,bucket,prefix,credential_ciphertext,schedule,utc_time,weekday,retention,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,ctx.actor.workspaceId,ctx.actor.id,input.name,input.kind,origin,input.region,input.bucket,prefix,cipher,input.schedule,input.time,input.weekday,input.retention,ctx.now,ctx.now)],entity:{id,kind:'backup-destination',revisionId:id},value:{id}})});
 return {destination:destinationView(await requireDestination(ctx,result.value.id))};
}
export async function removeDestination(ctx:FeatureContext,id:string,operationKey:string){await requireDestination(ctx,id);await commitOperation(ctx,{operationKey,action:'backup.remove',request:{id},authorize:()=>requireWorkspaceOwner(ctx),prepare:async()=>({statements:[ctx.db.prepare("UPDATE backup_destinations SET credential_ciphertext=NULL,state='removed',updated_at=?,drill_report_json=NULL WHERE id=? AND workspace_id=?").bind(ctx.now,id,ctx.actor.workspaceId)],entity:{id,kind:'backup-destination',revisionId:ctx.now},value:{removed:true}})});return {removed:true};}
/** Replace expired or incorrect credentials without discarding the schedule or its history. */
export async function replaceDestinationCredentials(ctx:FeatureContext,id:string,key:string,input:{operationKey:string;accessKeyId:string;secretAccessKey:string}){
 const row=await requireDestination(ctx,id);
 if(!key||key.length<32)throw new ApiProblem(503,'CREDENTIAL_UNAVAILABLE','CONNECTOR_CREDENTIALS_KEY is required.');
 const cipher=await encryptSecret(key,JSON.stringify({accessKeyId:input.accessKeyId,secretAccessKey:input.secretAccessKey}),scope(row));
 await commitOperation(ctx,{operationKey:input.operationKey,action:'backup.credentials',request:{id,...input},authorize:async()=>{await requireDestination(ctx,id);},prepare:async()=>({
  statements:[mutationGuard(ctx.db,"SELECT state='connected' AND credential_ciphertext=? FROM backup_destinations WHERE id=? AND workspace_id=?",[row.credential_ciphertext,id,ctx.actor.workspaceId]),ctx.db.prepare('UPDATE backup_destinations SET credential_ciphertext=?,updated_at=? WHERE id=?').bind(cipher,ctx.now,id)],
  entity:{id,kind:'backup-destination',revisionId:ctx.now},value:{updated:true},
 })});
 return {destination:destinationView(await requireDestination(ctx,id))};
}
export async function transport(ctx:FeatureContext,row:BackupDestinationRow,key:string,extra?:()=>Promise<void>){
 if(!row.credential_ciphertext)throw new ApiProblem(409,'BACKUP_DISCONNECTED','Reconnect the backup destination.');
 const credentials=JSON.parse(await decryptSecret(key,row.credential_ciphertext,scope(row))) as {accessKeyId:string;secretAccessKey:string};
 return new BackupS3(row,credentials,async()=>{ctx.authorizationEpoch=undefined;await requireWorkspaceOwner(ctx);const current=await requireDestination(ctx,row.id);if(current.credential_ciphertext!==row.credential_ciphertext)throw new ApiProblem(409,'BACKUP_DISCONNECTED','Backup destination authority changed.');if(extra)await extra();});
}
