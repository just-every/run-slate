import {forbiddenColumns,type DataRow} from './archive';

export function safeRow(table:string,row:DataRow):DataRow{
 const out={...row};
 for(const key of Object.keys(out))if(forbiddenColumns.test(key))out[key]=null;
 if(table==='intelligence_runs'&&out.agent_credential_id){
  out.input_json=JSON.stringify({...JSON.parse(String(out.input_json)),archiveAgentCredentialId:out.agent_credential_id});
  out.agent_credential_id=null;
 }
 if(table==='chat_connections'){out.state='disconnected';out.disconnected_at=new Date().toISOString();}
 if(table==='federation_connections')out.state='needs-attention';
 return out;
}

/** Restore retains facts and definitions, while every route back to execution needs fresh authority. */
export function restoredRow(table:string,input:DataRow,ownerEmail:string,now:string,keys:Map<string,string>){
 const row=safeRow(table,input);
 switch(table){
  case 'workspaces': row.ai_enabled=0;break;
  case 'intelligence_ambient_scopes':
   row.state='stopped';row.reason='Restored: fresh owner activation required.';break;
  case 'intelligence_ambient_events':
   if(['prepared','running'].includes(String(row.state))){row.state='blocked';row.failure_reason='RESTORED_AUTHORITY_REQUIRED';}break;
  case 'intelligence_interruptions':
   if(row.state==='reserved'){row.state='released';row.updated_at=now;}break;
  case 'intelligence_route_evaluations': row.revoked_at=row.revoked_at??now;break;
  case 'intelligence_skill_versions':
   if(row.state==='active')row.state=row.evaluation_id?'evaluated':'draft';
   row.authority_id=null;break;
  case 'intelligence_experiments':
   if(row.state==='active')row.state='stopped';row.grant_id=null;break;
  case 'intelligence_guided_tasks':
   if(row.state==='active')row.state='paused';break;
  case 'intelligence_evaluation_cases':
   if(row.execution_json){const execution=JSON.parse(String(row.execution_json));if(!execution.evaluationId)row.execution_json=JSON.stringify({...execution,recoveryPausedAt:now});}break;
  case 'members':
   row.status=String(row.email).toLowerCase()===ownerEmail.toLowerCase()?'active':'historical';
   row.is_setup_owner=row.status==='active'?1:0;if(row.status==='active')row.role='owner';break;
  case 'public_exposures': row.revoked_at=row.revoked_at??now;break;
  case 'notification_outbox': row.processed_at=now;break;
  case 'ai_runs': if(['queued','running'].includes(String(row.state)))row.state='cancelled';break;
  case 'automation_rules': row.disabled_at=now;row.disabled_reason='Restored: owner must re-enable authority.';break;
  case 'content_schedules': if(row.state==='scheduled')row.state='cancelled';break;
  case 'automation_jobs': row.state='failed';break;
  case 'intelligence_runs':
   if(['queued','running','paused','needs-review'].includes(String(row.status))){row.status='paused';row.lease_id=null;row.deadline_at=null;row.failure_reason='RESTORED_AUTHORITY_REQUIRED';row.input_json=JSON.stringify({...JSON.parse(String(row.input_json)),recoveryPausedAt:now});}break;
  case 'intelligence_effects':
   if(['prepared','dispatched'].includes(String(row.state)))row.state=row.state==='dispatched'?'uncertain':'cancelled';break;
  case 'intelligence_grants': row.revoked_at=row.revoked_at??now;break;
  case 'chat_deliveries': if(['pending','dispatching'].includes(String(row.state)))row.state='cancelled';break;
  case 'federation_sources': row.refresh_id=null;break;
  case 'federation_imports':
   if(row.state==='running')row.state='failed';
   if(keys.has(String(row.archive_key)))row.archive_key=keys.get(String(row.archive_key))!;break;
  case 'federation_exports':
   row.archive_key=null;if(row.state==='running'||row.state==='queued')row.state='failed';
   row.report_json=JSON.stringify({...JSON.parse(String(row.report_json)),recovery:{archiveOmitted:true,note:'Prior derived export archive omitted; create a new export from restored records.'}});break;
  case 'files': if(keys.has(String(row.storage_key)))row.storage_key=keys.get(String(row.storage_key))!;break;
 }
 return row;
}
