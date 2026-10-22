import {prepareEraseLegacy} from './erasure-legacy';
import {prepareEraseImportMetadata} from './erasure-imports';
import type {FeatureContext} from '../../app/feature-context';
import {prepareEraseIntelligence} from './erasure-intelligence';
import {prepareInvalidateExports} from '../portability/invalidation';
/** Personal stores are erased independently of shared pages, which remain their owners' records. */
export async function prepareEraseMemberStores(ctx:FeatureContext,memberId:string){
 const db=ctx.db,w=ctx.actor.workspaceId,now=ctx.now;
 const sourceIds=(await db.prepare('SELECT s.id FROM federation_sources s JOIN federation_connections c ON c.id=s.connection_id WHERE c.workspace_id=? AND c.member_id=?').bind(w,memberId).all<{id:string}>()).results.map(r=>r.id);
 const statements=[...await prepareEraseImportMetadata(ctx,[],memberId),...prepareEraseLegacy(ctx,sourceIds,memberId),...prepareInvalidateExports(ctx),...await prepareEraseIntelligence(ctx,sourceIds,memberId)];
 const add=(sql:string,...v:(string|null)[])=>statements.push(db.prepare(sql).bind(...v));
 for(const table of ['reminders','page_favourites','container_favourites','page_watches','container_watches','recent_pages','content_page_opens','content_tree_expansion','content_presence','reactions','discovery_preferences','discovery_revisions','saved_searches','discovery_snapshots','federation_oauth_states'])add(`DELETE FROM ${table} WHERE member_id=?`,memberId);
 add("UPDATE backup_destinations SET created_by_member_id=NULL,name='Removed owner backup',endpoint='',bucket='',prefix='',credential_ciphertext=NULL,state='removed',drill_report_json=NULL WHERE created_by_member_id=?",memberId);
 add("DELETE FROM federation_import_mappings WHERE import_job_id IN (SELECT id FROM provider_folder_runs WHERE workspace_id=? AND actor_id=?)",w,memberId);
 add("DELETE FROM provider_folder_runs WHERE workspace_id=? AND actor_id=?",w,memberId);
 add("DELETE FROM provider_folder_connections WHERE workspace_id=? AND member_id=?",w,memberId);
 add("UPDATE provider_folder_policies SET updated_by_member_id=NULL WHERE workspace_id=? AND updated_by_member_id=?",w,memberId);
 add('UPDATE saml_provider_config SET updated_by_member_id=NULL WHERE updated_by_member_id=?',memberId);
 add("UPDATE saml_provider_config SET break_glass_owner_id=NULL WHERE break_glass_owner_id=? AND enforced=0",memberId);
 add("UPDATE saml_provider_config SET allowed_emails_json=COALESCE((SELECT json_group_array(value) FROM json_each(saml_provider_config.allowed_emails_json) WHERE lower(value)!=(SELECT lower(email) FROM members WHERE id=?)),'[]') WHERE workspace_id=?",memberId,w);
 add('DELETE FROM watch_edit_sessions WHERE actor_member_id=?',memberId);
 add('UPDATE task_origins SET member_id=NULL WHERE member_id=?',memberId);
 add('DELETE FROM intelligence_interruptions WHERE recipient_id=?',memberId);
 add("UPDATE intelligence_reviews SET actor_id='erased',detail_json='{}' WHERE actor_id=?",memberId);
 add('DELETE FROM decision_reviews WHERE reviewed_by_member_id=?',memberId);
 add('UPDATE verification_rules SET updated_by_member_id=NULL WHERE updated_by_member_id=?',memberId);
 add('UPDATE verification_rule_flags SET dismissed_by_member_id=NULL WHERE dismissed_by_member_id=?',memberId);
 add('UPDATE knowledge_decisions SET owner_member_id=NULL,removed_by_member_id=NULL WHERE owner_member_id=? OR removed_by_member_id=?',memberId,memberId);
 add('DELETE FROM page_views WHERE viewer_member_id=?',memberId);
 add('DELETE FROM notifications WHERE recipient_member_id=?',memberId);
 add("UPDATE comments SET body_json='[]',author_member_id=NULL,deleted_at=? WHERE author_member_id=?",now,memberId);
 add("UPDATE record_revisions SET content_json='{}',author_member_id=NULL WHERE author_member_id=?",memberId);
 add("UPDATE core_entity_revisions SET content_json='{}',content_hash='',author_member_id=NULL WHERE (entity_kind='member' AND entity_id=?) OR author_member_id=?",memberId,memberId);
 add("UPDATE activity_entries SET detail_json='{}',actor_member_id=NULL WHERE actor_member_id=? OR (target_kind='member' AND target_id=?)",memberId,memberId);
 add("UPDATE operation_receipts SET response_json='{\"value\":{\"erased\":true}}' WHERE actor_member_id=?",memberId);
 add("UPDATE content_archive_locations SET reason=NULL WHERE actor_member_id=?",memberId);
 add("UPDATE content_schedules SET label=NULL,failure=NULL,publication_json=NULL,state='cancelled' WHERE actor_member_id=?",memberId);
 add('DELETE FROM content_suggestions WHERE proposed_by_member_id=?',memberId);
 add("UPDATE chat_messages SET state='withdraw' WHERE state<>'restricted' AND id IN (SELECT message_id FROM chat_message_sources WHERE actor_member_id=?)",memberId);
 add('UPDATE chat_message_sources SET actor_member_id=NULL WHERE actor_member_id=?',memberId);
 add("UPDATE chat_deliveries SET state='cancelled',failure='actor_erased' WHERE state='pending' AND outbox_id IN (SELECT id FROM notification_outbox WHERE actor_member_id=?)",memberId);
 add("UPDATE notification_outbox SET detail_json='{}',recipients_json='[]',watched_recipients_json='[]',actor_member_id=NULL,processed_at=COALESCE(processed_at,?) WHERE actor_member_id=?",now,memberId);
 add("UPDATE chat_connections SET destination='',target_label='',credential_ciphertext=NULL,source_connection_id=NULL,source_connection_revision_id=NULL,state='disconnected',disconnected_at=?,needs_attention_reason=NULL,last_failure_reason=NULL,audience_member_ids_json='[]' WHERE connected_by_member_id=?",now,memberId);
 add("UPDATE chat_deliveries SET state='cancelled',failure=NULL,provider_receipt=NULL WHERE connection_id IN (SELECT id FROM chat_connections WHERE connected_by_member_id=?)",memberId);
 add("UPDATE intelligence_agent_credentials SET token_hash='erased:'||id,scope_json='{}',revoked_at=COALESCE(revoked_at,?) WHERE owner_id=? OR subject_id=?",now,memberId,memberId);
 add("UPDATE intelligence_model_policy SET policy_json='{}' WHERE owner_id=?",memberId);
 for(const id of sourceIds){
  add('DELETE FROM federation_passages WHERE revision_id IN (SELECT id FROM federation_revisions WHERE source_id=?)',id);
  add("UPDATE federation_revisions SET title='',acl_json='{}',remote_revision='erased:'||id,content_hash='',deleted_at=? WHERE source_id=?",now,id);
  add("UPDATE federation_sources SET remote_id='erased:'||id,state='deleted',published_revision_id=NULL,refresh_id=NULL,updated_at=? WHERE id=?",now,id);
 }
 add("UPDATE federation_connections SET account_id='erased:'||id,credential_ciphertext=NULL,config_json='{}',state='revoked',refresh_claim=NULL,updated_at=? WHERE workspace_id=? AND member_id=?",now,w,memberId);
 add("INSERT INTO content_media_cleanup SELECT archive_key,? FROM federation_imports WHERE workspace_id=? AND actor_id=? AND state!='deleted' ON CONFLICT DO NOTHING",now,w,memberId);
 add("UPDATE federation_imports SET filename='Erased original archive',report_json='{}',counts_json='{}',state='deleted',updated_at=? WHERE workspace_id=? AND actor_id=?",now,w,memberId);
 add("UPDATE chat_connections SET audience_member_ids_json=COALESCE((SELECT json_group_array(value) FROM json_each(chat_connections.audience_member_ids_json) WHERE value<>?),'[]') WHERE workspace_id=?",memberId,w);
 return statements;
}
