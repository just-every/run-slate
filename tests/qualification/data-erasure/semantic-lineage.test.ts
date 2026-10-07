import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {reset} from '../authority/fixture';
import {fixture,insert} from '../data/fixture';
import {seedPage} from '../../e2e/setup/fixtures';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';
beforeEach(reset);

// Controlled retained snapshots exercise historical storage forms, not provider output.
test.each(['stage','legacy-revision','evaluation','execution','legacy-ref-array'] as const)('nested semantic lineage in %s erases derivatives while equal prose survives',async(store)=>{
 const f=await fixture(),host=await seedPage(f.page.containerId,{title:'Independent host',authorMemberId:f.owner}),now=f.ctx.now;
 await insert('page_revisions',{id:f.page.workingRevisionId,page_id:f.page.pageId,origin:'autosave',content_hash:'controlled',body_json:'[]',properties_json:'{}',created_at:now});
 for(const linked of [true,false]){
  const suffix=linked?'linked':'prose',skillId=`semantic-${suffix}`,version=`semantic-version-${suffix}`,runId=`semantic-run-${suffix}`;
  const nested=linked?{nested:{citations:[{revisionId:f.page.workingRevisionId}]}}:{nested:{text:f.page.pageId,question:f.page.workingRevisionId,instructions:f.page.pageId,requiredStatements:[f.page.workingRevisionId],limitations:[f.page.pageId]}};
  await insert('intelligence_skills',{id:skillId,workspace_id:f.workspaceId,page_id:host.pageId,owner_id:f.owner,name:'Keep independent method',current_revision_id:version,created_at:now,updated_at:now});
  await insert('intelligence_skill_versions',{id:version,skill_id:skillId,state:'active',definition_json:'{"instructions":"Independent source method"}',created_at:now});
  await insert('intelligence_runs',{id:runId,workspace_id:f.workspaceId,requester_id:f.owner,page_id:host.pageId,kind:'answer',status:'completed',revision_id:`revision-${runId}`,input_json:'{}',refs_json:store==='legacy-ref-array'&&linked?JSON.stringify([f.page.pageId]):store==='legacy-revision'?JSON.stringify([{kind:'decision',sourceId:`semantic-decision-${suffix}`,revisionId:`semantic-old-${suffix}`}]):'[]',output_json:JSON.stringify(!linked||store==='execution'?nested:{text:'Derived answer'}),skill_revision_id:version,created_at:now,updated_at:now});
  if(store==='stage')await insert('intelligence_stages',{id:`semantic-stage-${suffix}`,run_id:runId,stage:'generation',state:'completed',result_json:JSON.stringify(nested),started_at:now});
  if(store==='legacy-revision'){
   const decisionId=`semantic-decision-${suffix}`;
   await insert('knowledge_decisions',{id:decisionId,workspace_id:f.workspaceId,page_id:(await seedPage(f.page.containerId,{title:`Decision ${suffix}`,authorMemberId:f.owner})).pageId,question:'Retained decision',created_at:now,updated_at:now,revision_id:`semantic-old-${suffix}`});
   await insert('record_revisions',{id:`semantic-old-${suffix}`,workspace_id:f.workspaceId,entity_kind:'decision',entity_id:decisionId,content_hash:'controlled',content_json:JSON.stringify(nested),created_at:now});
  }
  if(store==='evaluation')await insert('intelligence_evaluations',{id:`semantic-eval-${suffix}`,workspace_id:f.workspaceId,skill_revision_id:version,case_hash:'controlled',result_json:JSON.stringify(nested),passed:1,created_at:now});
  if(store==='execution')await insert('intelligence_evaluation_cases',{id:`semantic-cases-${suffix}`,workspace_id:f.workspaceId,skill_revision_id:version,cutoff:now,cases_json:'[]',source_refs_json:'[]',content_hash:'controlled',owner_id:f.owner,created_at:now,execution_json:JSON.stringify(linked?{candidateRunId:runId}:nested)});
 }
 await archivePage(f.ctx,f.page.pageId,{operationKey:'semantic-trash',expectedRevisionId:f.page.revisionId,action:'trash'});
 await permanentDeletePage(f.ctx,f.page.pageId,{operationKey:'semantic-erase',confirmedPageIds:[f.page.pageId]});
 expect(await env.DB.prepare("SELECT output_json,failure_reason FROM intelligence_runs WHERE id='semantic-run-linked'").first()).toEqual({output_json:null,failure_reason:'SOURCE_DELETED'});
 const independent=await env.DB.prepare("SELECT output_json,failure_reason FROM intelligence_runs WHERE id='semantic-run-prose'").first<{output_json:string;failure_reason:string|null}>();
 expect(independent?.failure_reason).toBeNull();expect(independent?.output_json).toContain(f.page.pageId);
 expect(await env.DB.prepare("SELECT state FROM intelligence_skill_versions WHERE id='semantic-version-prose'").first()).toEqual({state:'active'});
 if(['evaluation','execution'].includes(store))expect(await env.DB.prepare("SELECT state FROM intelligence_skill_versions WHERE id='semantic-version-linked'").first()).toEqual({state:'retired'});
 if(store==='legacy-revision'){
  expect(await env.DB.prepare("SELECT question FROM knowledge_decisions WHERE id='semantic-decision-linked'").first()).toEqual({question:''});
  expect(await env.DB.prepare("SELECT question FROM knowledge_decisions WHERE id='semantic-decision-prose'").first()).toEqual({question:'Retained decision'});
 }
 expect(await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(host.pageId).first()).toEqual({title:'Independent host',deleted_at:null});
});
