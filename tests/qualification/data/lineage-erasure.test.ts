beforeEach(resetDeployment);
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {env} from 'cloudflare:test';
import {test,expect,beforeEach} from 'vitest';
import {fixture,insert,canary,canaries} from './fixture';
import {removeMember} from '../../../src/core/features/workspace/members';

test('BASE-DATA-003 member erasure clears reviews, interruptions and guided steps on retained shared work',async()=>{
 const {ctx,workspaceId,owner,subject,page}=await fixture(),now=ctx.now,json=JSON.stringify({text:canary});
 await insert('intelligence_runs',{id:'shared-run',workspace_id:workspaceId,requester_id:owner,page_id:page.pageId,kind:'answer',status:'completed',revision_id:'shared-run-revision',input_json:'{}',refs_json:'[]',output_json:'{"shared":"retained"}',created_at:now,updated_at:now});
 await insert('intelligence_reviews',{id:'member-review',run_id:'shared-run',actor_id:subject,outcome:'accepted',detail_json:json,created_at:now});
 await insert('intelligence_interruptions',{id:'member-interruption',workspace_id:workspaceId,recipient_id:subject,equivalence_key:canary,run_id:'shared-run',seconds:1,state:'delivered',mandatory:0,created_at:now,updated_at:now});
 await insert('intelligence_guided_tasks',{id:'member-task',workspace_id:workspaceId,run_id:'shared-run',page_id:page.pageId,owner_id:subject,state:'running',revision_id:'member-task-revision',created_at:now});
 await insert('intelligence_guided_steps',{id:'member-step',task_id:'member-task',ordinal:0,instruction:canary,source_refs_json:'[]',verification_json:json,state:'pending'});
 await insert('knowledge_decisions',{id:'member-decision',page_id:page.pageId,workspace_id:workspaceId,question:'Shared decision',owner_member_id:subject,created_at:now,updated_at:now,revision_id:'member-decision-revision'});
 await insert('decision_reviews',{id:'member-decision-review',decision_id:'member-decision',note:canary,reviewed_by_member_id:subject,created_at:now});
 const tables=['intelligence_reviews','intelligence_interruptions','intelligence_guided_steps','decision_reviews'];expect(Object.values(await canaries(tables)).every(n=>n>0)).toBe(true);
 await removeMember(ctx,{operationKey:'member-derived-erase',memberId:subject,erase:true});expect(await canaries(tables)).toEqual(Object.fromEntries(tables.map(t=>[t,0])));
 expect(await env.DB.prepare('SELECT output_json FROM intelligence_runs WHERE id=?').bind('shared-run').first()).toEqual({output_json:'{"shared":"retained"}'});expect(await env.DB.prepare('SELECT owner_member_id FROM knowledge_decisions WHERE id=?').bind('member-decision').first()).toEqual({owner_member_id:null});
});
