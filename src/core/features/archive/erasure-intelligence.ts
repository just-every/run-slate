import {interruptSelectedAttempts} from '../runs/attempt-interruption';
import {intelligenceErasureClosure} from './erasure-closure';
import {referencesAny} from './erasure-references';
import type {FeatureContext} from '../../app/feature-context';
/** Resolve lineage before mutating any ref arrays: later subqueries must not lose the erased graph. */
export async function prepareEraseIntelligence(ctx:FeatureContext,sourceIds:string[],memberId?:string){
 const db=ctx.db,workspace=ctx.actor.workspaceId,member=memberId??null;
 const {skills,inquiries,runs,scopes,decisions,tasks,all}=await intelligenceErasureClosure(ctx,sourceIds,memberId);
 const s:D1PreparedStatement[]=[],add=(sql:string,...v:(string|null)[])=>s.push(db.prepare(sql).bind(...v)),inside='IN (SELECT value FROM json_each(?))';
 for(const table of ['intelligence_hypotheses','intelligence_analyses','intelligence_artifacts'])add(`DELETE FROM ${table} WHERE inquiry_id ${inside}`,inquiries);
 add(`DELETE FROM intelligence_observations WHERE experiment_id IN (SELECT id FROM intelligence_experiments WHERE inquiry_id ${inside})`,inquiries);
 add(`UPDATE intelligence_experiments SET plan_json='{}',outcome_json=NULL,state='stopped' WHERE inquiry_id ${inside}`,inquiries);
 add(`UPDATE intelligence_inquiries SET question='',refs_json='[]',audience_json='[]',interim_json=NULL WHERE id ${inside}`,inquiries);
 add(`UPDATE intelligence_effects SET account_id='erased',intent_json='{}',receipt_json=CASE WHEN receipt_json IS NULL THEN NULL ELSE '{"redacted":true}' END,observed_json=NULL,failure_reason='SOURCE_DELETED',state=CASE WHEN state='prepared' THEN 'cancelled' ELSE state END WHERE run_id ${inside}`,runs);
 // Preserve bounded liability for dispatched work before erasing its sensitive receipt.
 s.push(...interruptSelectedAttempts(db,`SELECT value FROM json_each(?)`,[runs],ctx.now,'SOURCE_DELETED'));
 add(`UPDATE intelligence_budgets SET released_at=COALESCE(released_at,?) WHERE run_id ${inside}`,ctx.now,runs);
 add(`UPDATE intelligence_interruptions SET state='released',updated_at=? WHERE run_id ${inside} AND state='reserved'`,ctx.now,runs);
 add(`UPDATE intelligence_stages SET result_json=NULL WHERE run_id ${inside}`,runs);
 add(`UPDATE intelligence_reviews SET detail_json='{}' WHERE run_id ${inside}`,runs);
 add(`DELETE FROM intelligence_guided_steps WHERE task_id ${inside}`,tasks);
 add(`UPDATE intelligence_guided_tasks SET state='stopped' WHERE id ${inside}`,tasks);
 add(`UPDATE intelligence_runs SET input_json='{}',output_json=NULL,route_reason=NULL,refs_json='[]',audience_json='[]',failure_reason='SOURCE_DELETED',lease_id=NULL,deadline_at=NULL,status=CASE WHEN status IN ('queued','running','paused','needs-review') THEN 'cancelled' ELSE status END WHERE id ${inside}`,runs);
 add(`UPDATE intelligence_skills SET name='' WHERE id ${inside}`,skills);
 add(`UPDATE intelligence_skill_versions SET definition_json='{}',state='retired' WHERE skill_id ${inside}`,skills);
 add(`UPDATE intelligence_evaluations SET result_json='{}' WHERE skill_revision_id IN (SELECT id FROM intelligence_skill_versions WHERE skill_id ${inside})`,skills);
 add(`UPDATE intelligence_evaluation_cases SET cases_json='[]',source_refs_json='[]',execution_json='{}' WHERE skill_revision_id IN (SELECT id FROM intelligence_skill_versions WHERE skill_id ${inside})`,skills);
 add(`UPDATE intelligence_ambient_events SET refs_json='[]',assessment_json=NULL,state='blocked',failure_reason='SOURCE_DELETED' WHERE scope_id ${inside}`,scopes);
 add(`UPDATE intelligence_ambient_scopes SET refs_json='[]',audience_json='[]',objective='',state='stopped',reason='SOURCE_DELETED' WHERE id ${inside}`,scopes);
 add(`DELETE FROM intelligence_route_evaluations WHERE workspace_id=? AND ${referencesAny('evidence_json','SELECT value FROM json_each(?)',true)}`,workspace,all);
 add(`UPDATE intelligence_impacts SET detail_json='{}',state='source-deleted' WHERE dependency_id IN (SELECT id FROM intelligence_dependencies WHERE page_id ${inside} OR source_id ${inside} OR target_id ${inside})`,all,all,all);
 add(`UPDATE intelligence_dependencies SET scope_json='{}' WHERE page_id ${inside} OR source_id ${inside} OR target_id ${inside}`,all,all,all);
 add(`UPDATE intelligence_grants SET scope_json='{}',revoked_at=COALESCE(revoked_at,?) WHERE workspace_id=? AND (owner_id=? OR subject_id=? OR id ${inside})`,ctx.now,workspace,member,member,all);
 add(`UPDATE intelligence_revisions SET content_json='{}',actor_id=CASE WHEN actor_id=? THEN 'erased' ELSE actor_id END WHERE workspace_id=? AND (entity_id ${inside} OR actor_id=?)`,member,workspace,all,member);
 add(`UPDATE record_revisions SET content_json='{}',content_hash='',author_member_id=NULL WHERE workspace_id=? AND entity_id ${inside}`,workspace,all);
 add(`UPDATE core_entity_revisions SET content_json='{}',content_hash='',author_member_id=NULL WHERE workspace_id=? AND entity_id ${inside}`,workspace,all);
 add(`UPDATE ai_runs SET input_json='{}',input_revisions_json='[]',proposal_json=NULL,citations_json='[]',accepted_changes_json=NULL,failure_reason='SOURCE_DELETED',state=CASE WHEN state IN ('queued','running','needs-review') THEN 'cancelled' ELSE state END WHERE workspace_id=? AND id ${inside}`,workspace,runs);
 add(`DELETE FROM decision_reviews WHERE decision_id ${inside}`,decisions);
 add(`DELETE FROM decision_citations WHERE decision_id ${inside}`,decisions);
 add(`UPDATE knowledge_decisions SET question='',options_json='[]',outcome=NULL,rationale=NULL,accepted_snapshot_json=NULL,owner_member_id=NULL,removed_by_member_id=NULL,removed_at=COALESCE(removed_at,?),review_at=NULL,accepted_revision_id=NULL WHERE id ${inside}`,ctx.now,decisions);
 add(`UPDATE operation_receipts SET response_json='{"value":{"deleted":true}}' WHERE workspace_id=? AND target_id ${inside} AND json_extract(response_json,'$.value.deletedPageIds') IS NULL AND COALESCE(json_extract(response_json,'$.value.state'),'')!='deleted' AND COALESCE(json_extract(response_json,'$.value.erased'),0)!=1`,workspace,all);
 add(`UPDATE activity_entries SET detail_json='{}',actor_member_id=NULL WHERE workspace_id=? AND target_id ${inside}`,workspace,all);
 return s;
}
