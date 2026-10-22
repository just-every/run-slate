import type {AppBindings,AuthenticatedMember} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import {runBackup,failBackup} from './run';
import type {BackupDestinationRow,BackupRunRow} from './store';
/** Only owner-enabled due periods run; a lost worker receipt is recorded as a failure, never retried into another object. */
export async function scheduledBackups(env:AppBindings,now=new Date().toISOString()){
 const destinations=(await env.DB.prepare("SELECT * FROM backup_destinations WHERE state='connected' ORDER BY id").all<BackupDestinationRow>()).results;
 for(const row of destinations){
  const actor=await env.DB.prepare('SELECT m.id,m.workspace_id AS workspaceId,m.email,m.display_name AS displayName,m.initials,m.role,w.name AS workspaceName FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=?').bind(row.created_by_member_id).first<AuthenticatedMember>();
  if(!actor)continue;
  const ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor,sourceSecret:env.CONNECTOR_CREDENTIALS_KEY,now};
  const interrupted=(await env.DB.prepare("SELECT * FROM backup_runs WHERE destination_id=? AND state='running' AND started_at<?").bind(row.id,new Date(Date.parse(now)-3600000).toISOString()).all<BackupRunRow>()).results;
  for(const run of interrupted){await failBackup(ctx,row,run.id,'BACKUP_INTERRUPTED');if(run.archive_key)await env.FILES.delete(run.archive_key);}
  const due=`${now.slice(0,10)}T${row.utc_time}:00.000Z`;
  if(due>now||due<=row.created_at||row.schedule==='weekly'&&new Date(due).getUTCDay()!==row.weekday)continue;
  await runBackup(ctx,row,`${row.schedule}:${due}`,env.CONNECTOR_CREDENTIALS_KEY??'');
 }
}
