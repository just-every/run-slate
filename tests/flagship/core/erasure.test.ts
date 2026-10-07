import {env} from 'cloudflare:test';import {test,expect} from 'vitest';
import {seedWorkspace,seedMember,seedContainer,seedPage,seedBlock} from '../../e2e/setup/fixtures';
import {removeMember} from '../../../src/core/features/workspace/members';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';
import {createUlid} from '../../../src/core/shared/ulid';
import type {FeatureContext} from '../../../src/core/app/feature-context';
test('BASE-DATA-003 member erasure removes private personal bodies and R2 content while keeping anonymous audit',async()=>{
 const {workspaceId}=await seedWorkspace(),{memberId:owner}=await seedMember(workspaceId,{role:'owner',email:`${workspaceId}@owner.invalid`,displayName:'Owner',isSetupOwner:true}),{memberId:member}=await seedMember(workspaceId,{role:'member',email:`${workspaceId}@person.invalid`,displayName:'Person'}),{containerId}=await seedContainer(workspaceId,{ownerMemberId:member,visibility:'personal'}),{pageId}=await seedPage(containerId,{title:'Private personal information',authorMemberId:member});
 const now=new Date().toISOString(),fileId=createUlid(),key=`test-erasure/${fileId}`;await env.FILES.put(key,'Private bytes');await env.DB.prepare('INSERT INTO files (id,workspace_id,page_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(fileId,workspaceId,pageId,key,'private-name.txt','text/plain',13,now).run();
 const ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,now,actor:{id:owner,workspaceId,workspaceName:'Team',email:'owner@test.invalid',displayName:'Owner',initials:'OW',role:'owner'}};
 expect((await removeMember(ctx,{operationKey:'erase-member-001',memberId:member,erase:true})).value.erased).toBe(true);
 const page=await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(pageId).first<{title:string;deleted_at:string}>();expect(page?.title).toBe('');expect(page?.deleted_at).toBeTruthy();expect((await env.DB.prepare('SELECT display_name,email FROM members WHERE id=?').bind(member).first<{display_name:string;email:string}>())?.display_name).toBe('Deleted person');
 await runContentJobs(env);expect(await env.FILES.get(key)).toBeNull();expect(await env.DB.prepare("SELECT id FROM activity_entries WHERE action='member.erase' AND target_id=?").bind(member).first()).toBeTruthy();
});
