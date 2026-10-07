import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';
import {fixture,insert,canary,canaries} from './fixture';
test('BASE-DATA-003 erasure traverses AI, skill, inquiry, experiment, review and decision lineage',async()=>{
 const {ctx,workspaceId,owner,page}=await fixture(),p=page.pageId,now=ctx.now,refs=JSON.stringify([{kind:'page',sourceId:p,revisionId:page.workingRevisionId}]),json=JSON.stringify({personal:canary});
 await insert('intelligence_skills',{id:'data-skill',workspace_id:workspaceId,page_id:p,owner_id:owner,name:canary,current_revision_id:'data-skill-version',created_at:now,updated_at:now});
 await insert('intelligence_skill_versions',{id:'data-skill-version',skill_id:'data-skill',state:'draft',definition_json:json,created_at:now});
 await insert('intelligence_runs',{id:'data-run',workspace_id:workspaceId,requester_id:owner,page_id:p,kind:'answer',status:'completed',revision_id:'data-run-revision',input_json:json,refs_json:refs,output_json:json,skill_revision_id:'data-skill-version',created_at:now,updated_at:now});
 await insert('intelligence_stages',{id:'data-stage',run_id:'data-run',stage:'generation',state:'completed',result_json:json,started_at:now});
 await insert('intelligence_reviews',{id:'data-review',run_id:'data-run',actor_id:owner,outcome:'accepted',detail_json:json,created_at:now});
 await insert('intelligence_inquiries',{id:'data-inquiry',workspace_id:workspaceId,page_id:p,owner_id:owner,question:canary,revision_id:'data-inquiry-revision',refs_json:refs,audience_json:'[]',interim_json:json,created_at:now,updated_at:now});
 await insert('intelligence_hypotheses',{id:'data-hypothesis',inquiry_id:'data-inquiry',statement:canary,disconfirmation:canary,status:'open',evidence_json:refs,created_at:now});
 await insert('intelligence_analyses',{id:'data-analysis',inquiry_id:'data-inquiry',kind:'arithmetic',engine_version:'test-input',inputs_json:json,input_hash:'test-hash',result_json:json,refs_json:refs,created_at:now});
 await insert('intelligence_artifacts',{id:'data-artifact',inquiry_id:'data-inquiry',kind:'observation',content_json:json,refs_json:refs,created_at:now});
 await insert('intelligence_experiments',{id:'data-experiment',workspace_id:workspaceId,inquiry_id:'data-inquiry',revision_id:'data-experiment-revision',plan_json:json,state:'completed',ends_at:now,outcome_json:json,created_at:now});
 await insert('intelligence_observations',{id:'data-observation',experiment_id:'data-experiment',subject_id:canary,arm:'treatment',value:1,support_work:0,observed_at:now,refs_json:refs});
 await insert('intelligence_evaluations',{id:'data-evaluation',workspace_id:workspaceId,skill_revision_id:'data-skill-version',case_hash:'test-hash',result_json:json,passed:0,created_at:now});
 await insert('intelligence_evaluation_cases',{id:'data-cases',workspace_id:workspaceId,skill_revision_id:'data-skill-version',cutoff:now,cases_json:json,source_refs_json:refs,content_hash:'test-hash',owner_id:owner,created_at:now,execution_json:json});
 await insert('knowledge_decisions',{id:'data-decision',page_id:p,workspace_id:workspaceId,question:canary,options_json:json,rationale:canary,owner_member_id:owner,created_at:now,updated_at:now,revision_id:'data-decision-revision'});
 await insert('decision_reviews',{id:'data-decision-review',decision_id:'data-decision',note:canary,reviewed_by_member_id:owner,created_at:now});
 const tables=['intelligence_skills','intelligence_skill_versions','intelligence_runs','intelligence_stages','intelligence_reviews','intelligence_inquiries','intelligence_hypotheses','intelligence_analyses','intelligence_artifacts','intelligence_experiments','intelligence_observations','intelligence_evaluations','intelligence_evaluation_cases','knowledge_decisions','decision_reviews'];
 expect(Object.values(await canaries(tables)).every(n=>n>0)).toBe(true);
 await archivePage(ctx,p,{operationKey:'intelligence-trash',expectedRevisionId:page.revisionId,action:'trash'});
 await permanentDeletePage(ctx,p,{operationKey:'intelligence-erase',confirmedPageIds:[p]});
 expect(await canaries(tables)).toEqual(Object.fromEntries(tables.map(t=>[t,0])));
 expect(await env.DB.prepare("SELECT count(*) n FROM activity_entries WHERE action='archive.permanent-delete' AND target_id=?").bind(p).first()).toEqual({n:1});
});

test('BASE-DATA-003 migrated AI originals are erased with their page-dependent evidence',async()=>{
 const {ctx,workspaceId,owner,page}=await fixture(),now=ctx.now,refs=JSON.stringify([{sourceId:page.pageId}]);
 await insert('ai_agents',{id:'legacy-erasure-agent',workspace_id:workspaceId,name:canary,instructions:canary,source_scope_json:refs,owner_member_id:owner,created_at:now,updated_at:now,revision_id:'legacy-agent-revision'});
 await insert('ai_runs',{id:'legacy-erasure-run',workspace_id:workspaceId,requester_member_id:owner,agent_id:'legacy-erasure-agent',state:'completed',feature:'answer',input_json:JSON.stringify({personal:canary}),input_revisions_json:refs,proposal_json:JSON.stringify({personal:canary}),citations_json:refs,accepted_changes_json:JSON.stringify({personal:canary}),created_at:now});
 expect(Object.values(await canaries(['ai_agents','ai_runs'])).every(n=>n>0)).toBe(true);
 await archivePage(ctx,page.pageId,{operationKey:'legacy-erasure-trash',expectedRevisionId:page.revisionId,action:'trash'});
 await permanentDeletePage(ctx,page.pageId,{operationKey:'legacy-erasure-delete',confirmedPageIds:[page.pageId]});
 expect(await canaries(['ai_agents','ai_runs'])).toEqual({ai_agents:0,ai_runs:0});
});
