import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document} from '../authority/fixture';
import {insert,canary} from '../data/fixture';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';
import {getDecision} from '../../../src/core/features/decisions/service';
beforeEach(reset);
test('erased transitive authority and payload stay inactive after native archive restoration',async()=>{
 const f=await fixture(),source=await document(f,canary),host=await document(f,'Retained host'),ctx=f.context(),now=ctx.now;
 for(const [id,ref] of [['restore-a',source.ref],['restore-b',{kind:'skill',sourceId:'restore-a',revisionId:'restore-a-version'}]] as const){
  await insert('intelligence_skills',{id,workspace_id:f.workspaceId,page_id:host.id,owner_id:f.owner,name:canary,current_revision_id:`${id}-version`,created_at:now,updated_at:now});
  await insert('intelligence_skill_versions',{id:`${id}-version`,skill_id:id,state:'active',definition_json:JSON.stringify({refs:[ref],text:canary}),created_at:now});
 }
 await insert('intelligence_runs',{id:'restore-run',workspace_id:f.workspaceId,requester_id:f.owner,page_id:host.id,kind:'answer',status:'running',revision_id:'restore-run-version',input_json:JSON.stringify({text:canary}),refs_json:'[]',output_json:JSON.stringify({text:canary}),skill_revision_id:'restore-b-version',lease_id:'live-old-lease',created_at:now,updated_at:now,cost_micros:21,tokens:13});
 await insert('intelligence_stages',{id:'restore-stage',run_id:'restore-run',stage:'generation',state:'completed',result_json:JSON.stringify({text:canary}),started_at:now});
 const content=JSON.stringify({citations:[source.ref],question:canary});
 await insert('knowledge_decisions',{id:'restore-decision',page_id:host.id,workspace_id:f.workspaceId,question:canary,state:'accepted',accepted_snapshot_json:content,accepted_revision_id:'restore-decision-version',owner_member_id:f.owner,created_at:now,updated_at:now,revision_id:'restore-decision-version'});
 await insert('intelligence_revisions',{id:'restore-decision-version',workspace_id:f.workspaceId,entity_kind:'decision-acceptance',entity_id:'restore-decision',content_json:content,actor_id:f.owner,created_at:now});
 const revision=await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(source.id).first<string>('revision_id');
 await archivePage(ctx,source.id,{operationKey:'restore-erasure-trash',expectedRevisionId:revision!,action:'trash'});await permanentDeletePage(ctx,source.id,{operationKey:'restore-erasure-delete',confirmedPageIds:[source.id]});
 const exported=await exportWorkspace(ctx),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key'),bytes=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer());
 await reset();const target=await fixture();await restoreWorkspace(target.context(),bytes);
 const decision=await getDecision(f.context(),'restore-decision');expect(decision.citationsCurrent).toBe(false);expect(decision.removed_at).toBeTruthy();expect(JSON.stringify(decision)).not.toContain(canary);
 expect((await env.DB.prepare('SELECT state,definition_json FROM intelligence_skill_versions').all()).results).toEqual([{state:'retired',definition_json:'{}'},{state:'retired',definition_json:'{}'}]);
 expect(await env.DB.prepare("SELECT status,output_json,lease_id,cost_micros,tokens FROM intelligence_runs WHERE id='restore-run'").first()).toEqual({status:'cancelled',output_json:null,lease_id:null,cost_micros:21,tokens:13});
 expect(await env.DB.prepare("SELECT result_json FROM intelligence_stages WHERE id='restore-stage'").first()).toEqual({result_json:null});
 expect(await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(host.id).first()).toEqual({title:'Retained host',deleted_at:null});
 expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
