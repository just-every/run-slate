import {referencesAny} from './erasure-references';
import type {FeatureContext} from '../../app/feature-context';
/** Migrated originals remain portable and therefore remain subject to the same erasure. */
export function prepareEraseLegacy(ctx:FeatureContext,sourceIds:string[],memberId?:string){
 const ids=JSON.stringify(sourceIds),member=memberId??null,db=ctx.db,w=ctx.actor.workspaceId,s:D1PreparedStatement[]=[];
 const add=(sql:string,...v:(string|null)[])=>s.push(db.prepare(sql).bind(...v)),inIds='IN (SELECT value FROM json_each(?))';
 add(`UPDATE ai_runs SET input_json='{}',input_revisions_json='[]',proposal_json=NULL,citations_json='[]',accepted_changes_json=NULL,failure_reason='SOURCE_DELETED',state=CASE WHEN state IN ('queued','running','needs-review') THEN 'cancelled' ELSE state END WHERE workspace_id=? AND (requester_member_id=? OR ${referencesAny('input_revisions_json','SELECT value FROM json_each(?)',true)} OR ${referencesAny('input_json','SELECT value FROM json_each(?)')})`,w,member,ids,ids);
 add(`UPDATE ai_agents SET name='',instructions='',source_scope_json='{}' WHERE workspace_id=? AND (owner_member_id=? OR ${referencesAny('source_scope_json','SELECT value FROM json_each(?)',true)})`,w,member,ids);
 add('UPDATE ai_conversations SET title=\'\' WHERE workspace_id=? AND member_id=?',w,member);
 add(`UPDATE automation_jobs SET payload_json='{}',state='cancelled' WHERE rule_id IN (SELECT id FROM automation_rules WHERE actor_member_id=?) OR ${referencesAny('payload_json','SELECT value FROM json_each(?)')} OR EXISTS(SELECT 1 FROM json_each(payload_json,'$.targets') WHERE value ${inIds})`,member,ids,ids);
 add(`UPDATE automation_action_receipts SET receipt_json='{}' WHERE target_id ${inIds} OR run_id IN (SELECT id FROM automation_runs WHERE actor_member_id=?)`,ids,member);
 add(`UPDATE automation_runs SET trigger_json='{}',records_json='[]',detail_json='{}',state=CASE WHEN state IN ('queued','running') THEN 'disabled' ELSE state END WHERE workspace_id=? AND (actor_member_id=? OR ${referencesAny('records_json','SELECT value FROM json_each(?)',true)} OR ${referencesAny('trigger_json','SELECT value FROM json_each(?)')})`,w,member,ids,ids);
 add(`UPDATE automation_rules SET name='',trigger_json='{}',conditions_json='[]',branch_json=NULL,actions_json='[]',disabled_at=?,disabled_reason='Actor erased' WHERE workspace_id=? AND actor_member_id=?`,ctx.now,w,member);
 add(`INSERT INTO content_media_cleanup SELECT storage_key,? FROM files WHERE id IN (SELECT source_file_id FROM import_jobs WHERE workspace_id=? AND (requested_by_member_id=? OR id IN (SELECT import_job_id FROM import_mappings WHERE target_id IN (SELECT value FROM json_each(?))))) OR id IN (SELECT file_id FROM export_jobs WHERE workspace_id=?) ON CONFLICT DO NOTHING`,ctx.now,w,member,ids,w);
 add(`UPDATE files SET original_name='Deleted file',content_type='application/octet-stream',size_bytes=0,deleted_at=? WHERE id IN (SELECT source_file_id FROM import_jobs WHERE workspace_id=? AND (requested_by_member_id=? OR id IN (SELECT import_job_id FROM import_mappings WHERE target_id IN (SELECT value FROM json_each(?))))) OR id IN (SELECT file_id FROM export_jobs WHERE workspace_id=?)`,ctx.now,w,member,ids,w);
 add(`UPDATE import_jobs SET report_json='{}',counts_json='{}',state='failed' WHERE workspace_id=? AND (requested_by_member_id=? OR id IN (SELECT import_job_id FROM import_mappings WHERE target_id IN (SELECT value FROM json_each(?))))`,w,member,ids);
 add(`UPDATE export_jobs SET report_json='{}',counts_json='{}',state='failed' WHERE workspace_id=?`,w);
 return s;
}
