import {forbiddenColumns,type DataRow} from './archive';

export function safeRow(table:string,row:DataRow,now=new Date().toISOString()):DataRow{
 const out={...row};
 if(table==='provider_embed_observations')out.observed_at='1970-01-01T00:00:00.000Z';
 for(const key of Object.keys(out))if(forbiddenColumns.test(key))out[key]=null;
 if(table==='intelligence_runs'&&out.agent_credential_id){
  out.input_json=JSON.stringify({...JSON.parse(String(out.input_json)),archiveAgentCredentialId:out.agent_credential_id});
  out.agent_credential_id=null;
 }
 if(table==='provider_folder_policies')out.enabled=0;
 if(table==='provider_folder_connections'){out.state='disconnected';out.credential_ciphertext=null;}
 if(table==='provider_folder_runs'&&out.state==='running')out.state='failed';
 if(table==='backup_destinations'){out.state='disconnected';out.credential_ciphertext=null;}
 if(table==='backup_runs'&&out.state==='running'){out.state='failed';out.error_code='RESTORED_AUTHORITY_REQUIRED';out.archive_key=null;}
 if(table==='chat_connections'){out.state='disconnected';out.disconnected_at=out.disconnected_at??now;}
 if(table==='federation_connections')out.state='needs-attention';
 return out;
}

/** Restore retains facts and definitions, while every route back to execution needs fresh authority. */
const rules:Record<string,(row:DataRow,ownerEmail:string,now:string,keys:Map<string,string>)=>void>={
 'agent_door_agents':row=>{row.revoked=1;row.window=0;row.requests=0;},
 'agent_door_approvals':row=>{
  if(['pending','executing'].includes(String(row.state))) {
   row.state='expired';
   const saved=JSON.parse(String(row.saved));saved.expires_at='1970-01-01T00:00:00.000Z';
   row.saved=JSON.stringify(saved);
  }
 },
 'agent_door_reviews':row=>{
  const saved=JSON.parse(String(row.saved));delete saved.undo;row.saved=JSON.stringify(saved);
 },
 'agent_door_calls':row=>{
  if(['running','pending'].includes(String(row.state))) {
   row.state='refused';
   const prior=row.outcome?JSON.parse(String(row.outcome)):{decision:null};
   row.outcome=JSON.stringify({...prior,outcome:'refused',code:'restored_authority_required'});
  }
 },
 'scim_credentials':(row,_ownerEmail,now)=>{row.token_hash=null;row.revoked_at=row.revoked_at??now;},
 'scim_resources':(row)=>{row.invitation_id=null;if(row.resource_type==='User'&&row.state!=='deleted')row.state='inactive';},
 'webhook_subscriptions':(row,_ownerEmail,now)=>{row.credential_ciphertext=null;row.state='disabled';row.disabled_at=now;row.disabled_reason='Restored: create a fresh destination.';},
 'public_api_tokens':(row,_ownerEmail,now)=>{row.token_hash=null;row.revoked_at=row.revoked_at??now;},
 'review_requests':(row,_ownerEmail,now)=>{if(row.state==='pending')row.dispatch_paused_at=row.dispatch_paused_at??now;},
 'reminders':(row,_ownerEmail,now)=>{if(!row.delivered_at)row.cancelled_at=row.cancelled_at??now;},
 'workspaces':(row)=>{row.ai_enabled=0;},
 'intelligence_ambient_scopes':(row)=>{row.state='stopped';row.reason='Restored: fresh owner activation required.';},
 'intelligence_ambient_events':(row)=>{if(['prepared','running'].includes(String(row.state))){row.state='blocked';row.failure_reason='RESTORED_AUTHORITY_REQUIRED';}},
 'intelligence_interruptions':(row,_ownerEmail,now)=>{if(row.state==='reserved'){row.state='released';row.updated_at=now;}},
 'intelligence_route_evaluations':(row,_ownerEmail,now)=>{row.revoked_at=row.revoked_at??now;},
 'intelligence_skill_versions':(row)=>{if(row.state==='active')row.state=row.evaluation_id?'evaluated':'draft';
row.authority_id=null;},
 'intelligence_experiments':(row)=>{if(row.state==='active')row.state='stopped';row.grant_id=null;},
 'intelligence_guided_tasks':(row)=>{if(row.state==='active')row.state='paused';},
 'intelligence_evaluation_cases':(row,_ownerEmail,now)=>{if(row.execution_json){const execution=JSON.parse(String(row.execution_json));if(!execution.evaluationId)row.execution_json=JSON.stringify({...execution,recoveryPausedAt:now});}},
 // A removed member stays removed, even under the restoring owner's address, so access they lost is never reopened.
 'members':(row,ownerEmail)=>{row.status=row.status==='removed'?'removed':String(row.email).toLowerCase()===ownerEmail.toLowerCase()?'active':'historical';
row.is_setup_owner=row.status==='active'?1:0;if(row.status==='active')row.role='owner';},
 'public_exposures':(row,_ownerEmail,now)=>{row.revoked_at=row.revoked_at??now;},
 'notification_outbox':(row,_ownerEmail,now)=>{row.processed_at=now;},
 'ai_runs':(row)=>{if(['queued','running'].includes(String(row.state)))row.state='cancelled';},
 'automation_rules':(row,_ownerEmail,now)=>{row.disabled_at=now;row.disabled_reason='Restored: owner must re-enable authority.';},
 'content_schedules':(row)=>{if(row.state==='scheduled')row.state='cancelled';},
 'automation_jobs':(row)=>{row.state='failed';},
 'intelligence_runs':(row,_ownerEmail,now)=>{if(['queued','running','paused','needs-review'].includes(String(row.status))){row.status='paused';row.lease_id=null;row.deadline_at=null;row.failure_reason='RESTORED_AUTHORITY_REQUIRED';row.input_json=JSON.stringify({...JSON.parse(String(row.input_json)),recoveryPausedAt:now});}},
 'intelligence_effects':(row)=>{if(['prepared','dispatched'].includes(String(row.state)))row.state=row.state==='dispatched'?'uncertain':'cancelled';},
 'intelligence_grants':(row,_ownerEmail,now)=>{row.revoked_at=row.revoked_at??now;},
 'chat_deliveries':(row)=>{if(['pending','dispatching'].includes(String(row.state)))row.state='cancelled';},
 'federation_sources':(row)=>{row.refresh_id=null;},
 'federation_imports':(row,_ownerEmail,_now,keys)=>{if(row.state==='running'&&!row.kit_id)row.state='failed';
if(keys.has(String(row.archive_key)))row.archive_key=keys.get(String(row.archive_key))!;},
 'federation_exports':(row)=>{row.archive_key=null;if(row.state==='running'||row.state==='queued')row.state='failed';
row.report_json=JSON.stringify({...JSON.parse(String(row.report_json)),recovery:{archiveOmitted:true,note:'Prior derived export archive omitted; create a new export from restored records.'}});},
 'files':(row,_ownerEmail,_now,keys)=>{if(keys.has(String(row.storage_key)))row.storage_key=keys.get(String(row.storage_key))!;},
};
/**
 * Rows that give a member access. Removing a member deletes their memberships
 * and revokes their grants, keeping the revoked grants as history
 * (workspace/members.ts), so an archive holding a live one for a removed member
 * was changed after export; restore leaves it out. A revoked grant gives no
 * access and comes back as the history it is.
 */
export const memberAccess:Record<string,(row:DataRow)=>unknown>={
 page_grants:row=>row.principal_kind==='member'&&!row.revoked_at?row.principal_id:null,
 container_grants:row=>row.principal_kind==='member'&&!row.revoked_at?row.principal_id:null,
 group_members:row=>row.member_id,
 container_members:row=>row.member_id,
};
export function restoredRow(table:string,input:DataRow,ownerEmail:string,now:string,keys:Map<string,string>){
 const row=safeRow(table,input,now);
 rules[table]?.(row,ownerEmail,now,keys);
 return row;
}
