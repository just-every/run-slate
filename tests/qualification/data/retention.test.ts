import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {seedWorkspace,seedMember,seedContainer,seedPage,seedPageGrant} from '../../e2e/setup/fixtures';
import {scheduledDiscovery} from '../../../src/core/features/notifications/jobs';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';
import {archivePage} from '../../../src/core/features/archive/service';
import type {FeatureContext} from '../../../src/core/app/feature-context';
test('BASE-DATA-002 archived and trashed content survives past and future maintenance',async()=>{
 const {workspaceId}=await seedWorkspace(),{memberId}=await seedMember(workspaceId,{role:'owner',email:'retained@example.invalid',displayName:'Retained'}),{containerId}=await seedContainer(workspaceId,{ownerMemberId:memberId,visibility:'open'}),page=await seedPage(containerId,{title:'Retain sensitive biography',authorMemberId:memberId});
 await seedPageGrant(page.pageId,{principalKind:'member',principalId:memberId,level:'full'});
 const ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{id:memberId,workspaceId,workspaceName:'Retention',email:'retained@example.invalid',displayName:'Retained',initials:'RT',role:'owner'},now:new Date().toISOString()};
 await archivePage(ctx,page.pageId,{operationKey:'retention-trash',expectedRevisionId:page.revisionId,action:'trash',reason:'Retain personal reason'});
 for(const time of ['1999-01-01T00:00:00.000Z','2100-01-01T00:00:00.000Z'])await runContentJobs(env,time);
 expect(await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(page.pageId).first()).toEqual({title:'Retain sensitive biography',deleted_at:null});
 expect(await env.DB.prepare('SELECT reason FROM content_archive_locations WHERE page_id=?').bind(page.pageId).first()).toEqual({reason:'Retain personal reason'});
});

test('BASE-DATA-002 disposable search/presence expiry leaves saved search and canonical source content intact',async()=>{
 const {fixture,insert,canary}=await import('./fixture');const {search}=await import('../../../src/core/features/search/service');
 const {ctx,workspaceId,owner,page}=await fixture(),past={...ctx,now:'2000-01-01T00:00:00.000Z'};
 const before=await search(past,{query:canary});expect(before.items.some(r=>r.id===page.pageId)).toBe(true);
 await insert('saved_searches',{id:'retained-saved-search',workspace_id:workspaceId,member_id:owner,name:canary,query_json:JSON.stringify({query:canary}),revision_id:'retention-search-revision',created_at:past.now,updated_at:past.now});
 await insert('content_presence',{page_id:page.pageId,member_id:owner,session_id:'expired-collaboration-session',cursor_json:'{"block":"transient-cursor"}',expires_at:past.now});
 await scheduledDiscovery(env);await runContentJobs(env,'2100-01-01T00:00:00.000Z');
 expect(await env.DB.prepare('SELECT count(*) n FROM discovery_snapshots WHERE workspace_id=?').bind(workspaceId).first()).toEqual({n:0});
 expect(await env.DB.prepare('SELECT name,query_json FROM saved_searches WHERE id=?').bind('retained-saved-search').first()).toEqual({name:canary,query_json:JSON.stringify({query:canary})});
 expect((await search(ctx,{query:canary})).items.map(r=>r.id)).toEqual(before.items.map(r=>r.id));
});
