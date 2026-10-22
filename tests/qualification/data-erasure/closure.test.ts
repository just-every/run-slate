import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {fixture,insert,canary} from '../data/fixture';
import {seedPage,seedPageGrant} from '../../e2e/setup/fixtures';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';
import {getDecision,decisionHistory} from '../../../src/core/features/decisions/service';
import {removeMember} from '../../../src/core/features/workspace/members';

async function erase(f:Awaited<ReturnType<typeof fixture>>){await archivePage(f.ctx,f.page.pageId,{operationKey:'closure-trash',expectedRevisionId:f.page.revisionId,action:'trash'});await permanentDeletePage(f.ctx,f.page.pageId,{operationKey:'closure-erase',confirmedPageIds:[f.page.pageId]});}
test('decision cited through revision or citation on unrelated host loses personal content and authority',async()=>{
 for(const store of ['revision','citation'] as const){
 const f=await fixture(),host=await seedPage(f.page.containerId,{title:'Independent host',authorMemberId:f.owner});
 await seedPageGrant(host.pageId,{principalKind:'member',principalId:f.owner,level:'full'});
 const decisionId=`cited-decision-${store}`,revisionId=`cited-revision-${store}`;
 const content={question:canary,options:[canary],outcome:canary,rationale:canary,citations:store==='revision'?[{kind:'page',sourceId:f.page.pageId,revisionId:f.page.workingRevisionId}]:[]};
 await insert('knowledge_decisions',{id:decisionId,page_id:host.pageId,workspace_id:f.workspaceId,question:canary,options_json:JSON.stringify([canary]),outcome:canary,rationale:canary,owner_member_id:f.owner,created_at:f.ctx.now,updated_at:f.ctx.now,revision_id:revisionId});
 await insert('intelligence_revisions',{id:revisionId,workspace_id:f.workspaceId,entity_kind:'decision',entity_id:decisionId,content_json:JSON.stringify(content),actor_id:f.owner,created_at:f.ctx.now});
 await insert('record_revisions',{id:`legacy-${store}`,workspace_id:f.workspaceId,entity_kind:'decision',entity_id:decisionId,content_hash:'fixture',author_member_id:f.owner,content_json:JSON.stringify({question:canary}),created_at:f.ctx.now});
 if(store==='citation'){
  await insert('page_revisions',{id:f.page.workingRevisionId,page_id:f.page.pageId,origin:'autosave',content_hash:'fixture',body_json:'[]',properties_json:'{}',created_at:f.ctx.now});
  await insert('decision_citations',{decision_id:decisionId,page_revision_id:f.page.workingRevisionId,created_at:f.ctx.now});
 }
 const decision={value:{id:decisionId}};
 await erase(f);
 const retained=await getDecision(f.ctx,decision.value.id);expect(JSON.stringify(retained)).not.toContain(canary);expect(retained.citationsCurrent).toBe(false);expect(retained.removed_at).toBeTruthy();
 expect(await env.DB.prepare('SELECT content_json FROM record_revisions WHERE entity_id=?').bind(decisionId).first()).toEqual({content_json:'{}'});
 expect(JSON.stringify(await decisionHistory(f.ctx,decision.value.id))).not.toContain(canary);
 expect(await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(host.pageId).first()).toEqual({title:'Independent host',deleted_at:null});
 }
});

test('fixed-point erasure follows nested skill cycles, diamonds, revisions and downstream runs while independent copies survive',async()=>{
 const f=await fixture(),host=await seedPage(f.page.containerId,{title:'Independent host',authorMemberId:f.owner}),now=f.ctx.now;
 const refs:Record<string,unknown>={a:{nested:{sourceId:f.page.pageId,back:{skillRevisionId:'version-c'}}},b:{nested:[{skillRevisionId:'version-a'}]},c:{nested:[{skillId:'a'},{skillRevisionId:'version-b'}]},independent:{text:canary}};
 for(const [id,ref] of Object.entries(refs)){
  await insert('intelligence_skills',{id,workspace_id:f.workspaceId,page_id:host.pageId,owner_id:f.owner,name:canary,current_revision_id:`version-${id}`,created_at:now,updated_at:now});
  await insert('intelligence_skill_versions',{id:`version-${id}`,skill_id:id,state:'active',definition_json:JSON.stringify({ref,text:canary}),created_at:now});
 }
 for(const id of ['b','c','independent']){
  await insert('intelligence_runs',{id:`run-${id}`,workspace_id:f.workspaceId,requester_id:f.owner,page_id:host.pageId,kind:'answer',status:'completed',revision_id:`run-rev-${id}`,input_json:'{}',refs_json:'[]',output_json:JSON.stringify({text:canary}),skill_revision_id:`version-${id}`,created_at:now,updated_at:now,cost_micros:12,tokens:9});
  await insert('intelligence_stages',{id:`stage-${id}`,run_id:`run-${id}`,stage:'generation',state:'completed',result_json:JSON.stringify({text:canary}),started_at:now});
 }
 await insert('intelligence_runs',{id:'run-child',workspace_id:f.workspaceId,requester_id:f.owner,page_id:host.pageId,kind:'answer',status:'running',revision_id:'child-revision',parent_id:'run-c',input_json:'{}',refs_json:'[]',output_json:JSON.stringify({text:canary}),created_at:now,updated_at:now});
 await erase(f);
 expect(await env.DB.prepare("SELECT status,output_json FROM intelligence_runs WHERE id='run-child'").first()).toEqual({status:'cancelled',output_json:null});
 for(const id of ['a','b','c']){
  expect(await env.DB.prepare('SELECT name FROM intelligence_skills WHERE id=?').bind(id).first()).toEqual({name:''});
  expect(await env.DB.prepare('SELECT state,definition_json FROM intelligence_skill_versions WHERE id=?').bind(`version-${id}`).first()).toEqual({state:'retired',definition_json:'{}'});
 }
 for(const id of ['b','c']){
  expect(await env.DB.prepare('SELECT output_json,cost_micros,tokens,failure_reason FROM intelligence_runs WHERE id=?').bind(`run-${id}`).first()).toEqual({output_json:null,cost_micros:12,tokens:9,failure_reason:'SOURCE_DELETED'});
  expect(await env.DB.prepare('SELECT result_json FROM intelligence_stages WHERE id=?').bind(`stage-${id}`).first()).toEqual({result_json:null});
 }
 expect((await env.DB.prepare('SELECT name FROM intelligence_skills WHERE id=?').bind('independent').first())?.name).toBe(canary);
 expect(JSON.stringify(await env.DB.prepare('SELECT output_json FROM intelligence_runs WHERE id=?').bind('run-independent').first())).toContain(canary);
 expect(await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(host.pageId).first()).toEqual({title:'Independent host',deleted_at:null});
});

test('member erasure anonymizes only that actor in retained decision history',async()=>{
 const f=await fixture();
 await insert('knowledge_decisions',{id:'actor-decision',page_id:f.page.pageId,workspace_id:f.workspaceId,question:'Shared decision',owner_member_id:f.owner,created_at:f.ctx.now,updated_at:f.ctx.now,revision_id:'subject-history'});
 for(const [id,actor] of [['subject-history',f.subject],['owner-history',f.owner]])await insert('intelligence_revisions',{id,workspace_id:f.workspaceId,entity_kind:'decision',entity_id:'actor-decision',content_json:JSON.stringify({question:actor===f.subject?canary:'Independent owner history'}),actor_id:actor,created_at:f.ctx.now});
 await removeMember(f.ctx,{operationKey:'actor-erase',memberId:f.subject,erase:true});
 const history=await decisionHistory(f.ctx,'actor-decision');expect(JSON.stringify(history)).not.toContain(f.subject);expect(JSON.stringify(history)).not.toContain(canary);
 expect(history.items.find(r=>r.id==='owner-history')).toMatchObject({actor_id:f.owner,content:{question:'Independent owner history'}});
});
