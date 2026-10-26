import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {seedWorkspace,seedMember,seedContainer,seedPage,seedPageGrant,seedContainerGrant,seedGroup,sessionFor} from '../../e2e/setup/fixtures';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {createApi} from '../../../src/core/app/hono';
import {requirePageLevel} from '../../../src/core/features/sharing/current-access';
import type {FeatureContext} from '../../../src/core/app/feature-context';

async function scenario(){
  const {workspaceId}=await seedWorkspace();
  const {memberId:owner}=await seedMember(workspaceId,{role:'owner',email:`${workspaceId}@owner.invalid`,displayName:'Owner'});
  const {memberId:member}=await seedMember(workspaceId,{role:'member',email:`${workspaceId}@member.invalid`,displayName:'Member'});
  const context=(id:string)=>({db:env.DB,files:env.FILES,jobs:env.JOBS,now:new Date().toISOString(),actor:{id,workspaceId,workspaceName:'Test',email:'x@test.invalid',displayName:'Test',initials:'TE',role:id===owner?'owner':'member'}} as FeatureContext);
  const api=createApi(),cookies=new Map<string,string>();
  const view=async(id:string,pageId:string,status:200|404,phase:string)=>{
    let cookie=cookies.get(id);
    if(!cookie){cookie=await sessionFor(id);cookies.set(id,cookie);}
    const response=await api.request(`/api/pages/${pageId}`,{method:'GET',headers:{cookie}},env);
    expect(response.status,phase).toBe(status);
    expect(await response.json(),phase).toMatchObject(status===200?{page:{id:pageId}}:{code:'NOT_FOUND'});
  };
  return {workspaceId,owner,member,context,view};
}

// seedPage supplies ACL fixtures; real page reads also need immutable content.
async function seedReadableRevision(pageId:string){
  const page=await env.DB.prepare('SELECT working_revision_id,author_member_id,title,created_at FROM pages WHERE id=?').bind(pageId).first<{working_revision_id:string;author_member_id:string;title:string;created_at:string}>();
  if(!page)throw new Error(`Missing seeded page ${pageId}`);
  await env.DB.prepare("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES(?,?,?,'autosave',?,'[]',?,?)")
    .bind(page.working_revision_id,pageId,page.author_member_id,crypto.randomUUID(),JSON.stringify({title:page.title,labels:[]}),page.created_at).run();
}

test('page viewing applies current grants, private scopes, guest vetoes and restricted ancestry',async()=>{
  const cases=[
    {
      title:'SHARE-007 group removal changes current access immediately; owner role never grants page access',
      run:async()=>{
        const s=await scenario();
        const {containerId}=await seedContainer(s.workspaceId,{ownerMemberId:s.owner,visibility:'closed'});
        const {pageId}=await seedPage(containerId,{title:'Secret',authorMemberId:s.owner});
        await seedReadableRevision(pageId);
        const {groupId}=await seedGroup(s.workspaceId,{name:'Readers',memberIds:[s.member]});
        await seedPageGrant(pageId,{principalKind:'group',principalId:groupId,level:'view'});
        expect((await requirePageLevel(s.context(s.member),pageId,'view')).decision.allowed).toBe(true);
        await s.view(s.member,pageId,200,'group reader before membership removal');
        await env.DB.prepare('DELETE FROM group_members WHERE group_id=?').bind(groupId).run();
        await expect(requirePageLevel(s.context(s.member),pageId,'view')).rejects.toMatchObject({status:404});
        await s.view(s.member,pageId,404,'same reader session after group removal');
        await expect(requirePageLevel(s.context(s.owner),pageId,'view')).rejects.toMatchObject({status:404});
        await s.view(s.owner,pageId,404,'workspace owner without a page grant');
      },
    },
    {
      title:'LIFE-002 workspace grant never opens another author draft',
      run:async()=>{
        const s=await scenario();
        const {containerId}=await seedContainer(s.workspaceId,{ownerMemberId:s.owner,visibility:'default'});
        await seedContainerGrant(containerId,{principalKind:'workspace',principalId:s.workspaceId,level:'full'});
        const {pageId}=await seedPage(containerId,{title:'Private draft',authorMemberId:s.owner,lifecycle:'draft'});
        await seedReadableRevision(pageId);
        await expect(requirePageLevel(s.context(s.member),pageId,'view')).rejects.toMatchObject({status:404});
        await s.view(s.member,pageId,404,'workspace grant cannot expose another author draft');
        expect((await requirePageLevel(s.context(s.owner),pageId,'full')).decision.source).toBe('author');
        await s.view(s.owner,pageId,200,'draft author can view the private draft');
      },
    },
    {
      title:'CONT-005 personal container denies even a stored explicit outsider grant',
      run:async()=>{
        const s=await scenario();
        const {containerId}=await seedContainer(s.workspaceId,{ownerMemberId:s.owner,visibility:'personal'});
        const {pageId}=await seedPage(containerId,{title:'Personal',authorMemberId:s.owner});
        await seedReadableRevision(pageId);
        await seedPageGrant(pageId,{principalKind:'member',principalId:s.member,level:'full'});
        await expect(requirePageLevel(s.context(s.member),pageId,'view')).rejects.toMatchObject({status:404});
        await s.view(s.member,pageId,404,'personal container rejects the stored outsider grant');
      },
    },
    {
      title:'WORK-010 guest never inherits workspace grants and container veto wins over named grants',
      run:async()=>{
        const s=await scenario();
        await env.DB.prepare("UPDATE members SET member_kind='guest' WHERE id=?").bind(s.member).run();
        const {containerId}=await seedContainer(s.workspaceId,{ownerMemberId:s.owner,visibility:'open'});
        await seedContainerGrant(containerId,{principalKind:'workspace',principalId:s.workspaceId,level:'view'});
        const {pageId}=await seedPage(containerId,{title:'Team',authorMemberId:s.owner});
        await seedReadableRevision(pageId);
        await expect(requirePageLevel(s.context(s.member),pageId,'view')).rejects.toMatchObject({status:404});
        await s.view(s.member,pageId,404,'guest does not inherit the workspace grant');
        await seedPageGrant(pageId,{principalKind:'member',principalId:s.member,level:'view'});
        expect((await requirePageLevel(s.context(s.member),pageId,'view')).decision.allowed).toBe(true);
        await s.view(s.member,pageId,200,'named grant permits the same guest session');
        await env.DB.prepare("UPDATE containers SET guest_access='forbidden' WHERE id=?").bind(containerId).run();
        await expect(requirePageLevel(s.context(s.member),pageId,'view')).rejects.toMatchObject({status:404});
        await s.view(s.member,pageId,404,'container guest veto overrides the named grant');
      },
    },
    {
      title:'bulk current ACL agrees with single resolution and preserves restricted ancestors',
      run:async()=>{
        const {resolveCurrentAccessMany}=await import('../../../src/core/features/sharing/current-access');
        const s=await scenario();
        const {containerId}=await seedContainer(s.workspaceId,{ownerMemberId:s.owner,visibility:'closed'});
        await seedContainerGrant(containerId,{principalKind:'workspace',principalId:s.workspaceId,level:'edit'});
        const {pageId:parent}=await seedPage(containerId,{title:'Restricted',authorMemberId:s.owner});
        await seedReadableRevision(parent);
        await env.DB.prepare("UPDATE pages SET access_inheritance='restricted' WHERE id=?").bind(parent).run();
        const {pageId:child}=await seedPage(containerId,{title:'Child',authorMemberId:s.owner,parentPageId:parent});
        await seedReadableRevision(child);
        const {pageId:open}=await seedPage(containerId,{title:'Open',authorMemberId:s.owner});
        await seedReadableRevision(open);
        const decisions=await resolveCurrentAccessMany(s.context(s.member),[parent,child,open]);
        expect(decisions.get(parent)?.decision.allowed).toBe(false);
        expect(decisions.get(child)?.decision.allowed).toBe(false);
        expect(decisions.get(open)?.decision.allowed).toBe(true);
        await s.view(s.member,parent,404,'restricted ancestor before named grant');
        await s.view(s.member,child,404,'child preserves the restricted ancestor');
        await s.view(s.member,open,200,'unrestricted sibling inherits the workspace grant');
        await seedPageGrant(parent,{principalKind:'member',principalId:s.member,level:'view'});
        const after=await resolveCurrentAccessMany(s.context(s.member),[child]);
        expect(after.get(child)?.decision.level).toBe((await requirePageLevel(s.context(s.member),child,'view')).decision.level);
        await s.view(s.member,parent,200,'named grant opens the restricted ancestor');
        await s.view(s.member,child,200,'child inherits the named ancestor grant');
      },
    },
  ];
  for(const {title,run} of cases){
    try{
      // Native sessions require the one-workspace deployment each case seeds.
      await resetDeployment();
      await run();
    }catch(cause){
      throw new Error(`${title}: ${cause instanceof Error?cause.message:String(cause)}`,{cause});
    }
  }
});
