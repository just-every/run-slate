import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {createUlid} from '../../../src/core/shared/ulid';
import {seedWorkspace,seedMember,sessionFor} from '../../e2e/setup/fixtures';

/** Real native sessions and persisted grants; no content or authority response is faked. */
export async function draftPrivacyCase() {
  const {workspaceId}=await seedWorkspace();
  const identities=await Promise.all(['Owner','Author','Reader','Group reader','Outsider'].map(async(name,index)=>({
    id:(await seedMember(workspaceId,{role:index===0?'owner':'member',email:[`synthetic-slate-${index}`,'example.test'].join('@'),displayName:name})).memberId,
    email:[`synthetic-slate-${index}`,'example.test'].join('@'),
  })));
  const [owner,author,reader,groupReader,outsider]=identities;
  const sessions=new Map(await Promise.all(identities.map(async person=>[person.id,await sessionFor(person.id,{freshProof:true})] as const)));
  const origin=new URL(String(env.APP_URL)).origin,app=createApi();
  const request=async(actor:string|null,method:string,path:string,input?:unknown)=>{
    const response=await app.request(origin+path,{method,headers:{origin,'content-type':'application/json',...(actor?{cookie:sessions.get(actor)!}:{})},body:input===undefined?undefined:JSON.stringify(input)},env);
    return {status:response.status,body:await response.text()};
  };
  const ok=async(actor:string,method:string,path:string,input?:unknown)=>{
    const result=await request(actor,method,path,input);expect(result.status,result.body).toBe(200);return JSON.parse(result.body);
  };
  const profile=async(access:string,lifecycle='draft-then-publish')=>{
    const w=await ok(owner!.id,'GET','/api/workspace');
    const {name,mark,description,guestAccess,publicLinkAccess,anonymousAccess}=w;
    await ok(owner!.id,'PUT','/api/workspace',{operationKey:createUlid(),expectedRevisionId:w.revisionId,name,mark,description,guestAccess,publicLinkAccess,anonymousAccess,policies:{...w.policies,'page.access.v1':access,'page.lifecycle.v1':lifecycle}});
  };
  await profile('workspace-general');
  const createdContainer=(await ok(owner!.id,'POST','/api/containers',{operationKey:createUlid(),name:'Draft custody'})).value;
  const containerId=createdContainer.id,homeId=createdContainer.homePageId;
  await ok(owner!.id,'POST','/api/sharing',{operationKey:createUlid(),targetKind:'container',targetId:containerId,principalKind:'member',principalId:author!.id,level:'full'});
  const groupId=(await ok(owner!.id,'POST','/api/groups',{operationKey:createUlid(),name:'Draft reviewers',memberIds:[groupReader!.id]})).value.id;
  const blockId=createUlid(),title='CustodyMarker Private response draft',text='Only the author and named reviewers can read this response.';
  const id=(await ok(author!.id,'POST','/api/pages',{operationKey:createUlid(),containerId,title,blocks:[{id:blockId,blockType:'paragraph',treePosition:'a',content:{text:[{text}]}}]})).value.pageId;
  const read=()=>ok(author!.id,'GET',`/api/pages/${id}`);
  const grants=()=>ok(author!.id,'GET',`/api/sharing/pages/${id}`);
  const rows=async(table:string)=>(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
  // Include receipts and activity: a refused action may not leave a partial mutation.
  const snapshot=async()=>Object.fromEntries(await Promise.all(['pages','page_blocks','page_revisions','page_grants','public_exposures','operation_receipts','activity_entries','invitations'].map(async table=>[table,await rows(table)])));
  const storedDraft=async()=>Object.fromEntries(await Promise.all(['pages','page_blocks','page_revisions','page_grants','public_exposures'].map(async table=>[table,await rows(table)])));
  const refused=async(actor:string|null,method:string,path:string,input?:unknown)=>{
    const before=await snapshot(),response=await request(actor,method,path,input);
    expect(response.status,response.body).toBe(actor===null?401:404);
    expect(response.body).not.toContain(text);expect(await snapshot()).toEqual(before);
  };
  expect((await read()).blocks[0].content.text).toEqual([{text}]);
  expect((await grants()).items).toEqual([]);
  for(const person of [owner!,reader!,groupReader!,outsider!])await refused(person.id,'GET',`/api/pages/${id}`);
  await refused(null,'GET',`/api/pages/${id}`);
  await refused(null,'PATCH',`/api/pages/${id}`,{operationKey:createUlid(),expectedRevisionId:(await read()).page.revisionId,properties:{title:'Anonymous replacement'}});
  // Address sharing an existing member must actually create a current, visible grant.
  const addressInput={operationKey:createUlid(),kind:'guest',pageId:id,email:reader!.email,level:'view'};
  await ok(author!.id,'POST','/api/invitations',addressInput);
  expect((await ok(reader!.id,'GET',`/api/pages/${id}`)).blocks[0].content.text).toEqual([{text}]);
  const personal=(await grants()).items.find((g:any)=>g.principalId===reader!.id);
  expect(personal).toMatchObject({principalKind:'member',level:'view',status:'active',effective:true});
  const groupInput={operationKey:createUlid(),targetKind:'page',targetId:id,principalKind:'group',principalId:groupId,level:'view'};
  await ok(author!.id,'POST','/api/sharing',groupInput);
  expect((await ok(groupReader!.id,'GET',`/api/pages/${id}`)).blocks[0].content.text).toEqual([{text}]);
  const list=await grants();
  expect(list.items.map((g:any)=>[g.principalKind,g.principalId,g.level,g.status]).sort()).toEqual([['member',reader!.id,'view','active'],['group',groupId,'view','active']].sort());
  expect(list.effectiveItems.map((g:any)=>g.id).sort()).toEqual(list.items.map((g:any)=>g.id).sort());
  expect(list.inheritedItems).toEqual([]);
  for(const access of ['workspace-general','container-general']) {
    await profile(access);
    for(const [principalKind,principalId] of [['workspace',workspaceId],['container',containerId]]) {
      const before=await snapshot(),response=await request(author!.id,'POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:id,principalKind,principalId,level:'view'});
      expect(response.status,response.body).toBe(403);expect(JSON.parse(response.body).code).toBe('DRAFT_PRIVATE');expect(await snapshot()).toEqual(before);
    }
    const before=await snapshot(),response=await request(author!.id,'POST',`/api/publishing/${id}`,{operationKey:createUlid(),expectedRevisionId:(await read()).page.revisionId,host:String(env.PUBLIC_PAGE_HOST),slug:'private-response'});
    expect(response.status,response.body).toBe(403);expect(JSON.parse(response.body).code).toBe('PUBLICATION_FORBIDDEN');expect(await snapshot()).toEqual(before);
    const anonymous=await request(null,'GET','/p/private-response');expect(anonymous.status).toBe(404);expect(anonymous.body).not.toContain(text);
    for(const lifecycle of ['always-live','draft-then-publish']) {
      const retained=await storedDraft();await profile(access,lifecycle);
      expect(await storedDraft()).toEqual(retained);
      const doc=await read();expect(doc.page.lifecycle).toBe('draft');expect(doc.publishedRevisionId).toBeNull();expect(doc.blocks[0].content.text).toEqual([{text}]);
      for(const person of [owner!,outsider!])await refused(person.id,'GET',`/api/pages/${id}`);
      await refused(null,'GET',`/api/pages/${id}`);
      for(const person of [reader!,groupReader!])expect((await ok(person.id,'GET',`/api/pages/${id}`)).blocks[0].content.text).toEqual([{text}]);
    }
  }
  for(const grant of (await grants()).items)await ok(author!.id,'POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:id,id:grant.id,principalKind:grant.principalKind,principalId:grant.principalId,level:grant.level,revoke:true});
  for(const person of [reader!,groupReader!,owner!,outsider!]) {
    await refused(person.id,'GET',`/api/pages/${id}`);
    await refused(person.id,'PATCH',`/api/pages/${id}`,{operationKey:createUlid(),expectedRevisionId:(await read()).page.revisionId,properties:{title:'Revoked replacement'}});
  }
  const revoked=await snapshot();
  // Replaying either pre-revocation sharing receipt cannot resurrect a grant.
  await ok(author!.id,'POST','/api/invitations',addressInput);await ok(author!.id,'POST','/api/sharing',groupInput);
  expect(await snapshot()).toEqual(revoked);expect((await grants()).effectiveItems).toEqual([]);
  expect((await grants()).items.every((g:any)=>g.status==='revoked')).toBe(true);
  // A populated live control distinguishes exclusion from an empty projection.
  const control=(await ok(author!.id,'POST','/api/pages',{operationKey:createUlid(),containerId,title:'CustodyMarker Published response',blocks:[{id:createUlid(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'The published response is searchable.'}]}}]})).value.pageId;
  await ok(author!.id,'POST',`/api/pages/${control}/publish`,{operationKey:createUlid(),expectedRevisionId:(await ok(author!.id,'GET',`/api/pages/${control}`)).page.revisionId});
  await ok(author!.id,'POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:control,principalKind:'workspace',principalId:workspaceId,level:'view'});
  await ok(author!.id,'POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:control,principalKind:'member',principalId:reader!.id,level:'view'});
  const liveThread=(await ok(author!.id,'POST',`/api/comments/page/${control}`,{operationKey:createUlid(),body:[{text:'CustodyMarker published discussion'}]})).value.threadId;
  await ok(author!.id,'POST',`/api/comments/page/${id}`,{operationKey:createUlid(),body:[{text:'CustodyMarker private discussion'}]});
  const searchGrants=[];
  for(const [principalKind,principalId] of [['member',reader!.id],['group',groupId]]) {
    const input={operationKey:createUlid(),targetKind:'page',targetId:id,principalKind,principalId,level:'view'};
    searchGrants.push({...input,id:(await ok(author!.id,'POST','/api/sharing',input)).value.id});
  }
  for(const person of [reader!,groupReader!])expect((await ok(person.id,'GET',`/api/pages/${id}`)).blocks[0].content.text).toEqual([{text}]);
  for(const access of ['workspace-general','container-general']) {
    await profile(access);
    for(const person of identities) {
      const found=await ok(person.id,'GET','/api/search?q=CustodyMarker&kind=page');
      expect(found.items.map((item:any)=>item.id)).toEqual([control]);
      expect(found.total).toBe(1);
      expect(found.facets).toEqual({kind:{page:1},container:{[containerId]:1},status:{}});
      expect(found.nextCursor).toBeUndefined();
      const {filters:_,...projection}=found;
      expect(JSON.stringify(projection)).not.toContain(title);expect(JSON.stringify(projection)).not.toContain(text);
      const comments=await ok(person.id,'GET','/api/search?q=CustodyMarker&kind=comment-thread');
      expect(comments.items.map((item:any)=>item.id)).toEqual([liveThread]);expect(comments.total).toBe(1);
      expect(comments.facets).toEqual({kind:{'comment-thread':1},container:{[containerId]:1},status:{}});
      const queried=await ok(person.id,'POST',`/api/pages/${control}/query`,{orderBy:'title',limit:100});
      expect(queried.items.map((item:any)=>item.id)).toEqual([control,homeId]);
      const tree=await ok(person.id,'GET','/api/pages');
      expect(tree.items.map((item:any)=>item.id).sort()).toEqual(([author!.id,reader!.id,groupReader!.id].includes(person.id)?[id,control,homeId]:[control,homeId]).sort());
    }
  }
  for(const grant of searchGrants)await ok(author!.id,'POST','/api/sharing',{...grant,operationKey:createUlid(),revoke:true});
  for(const person of [reader!,groupReader!])await refused(person.id,'GET',`/api/pages/${id}`);
  const notifications=await ok(reader!.id,'GET','/api/notifications');
  expect(notifications.items.some((item:any)=>item.pageId===control)).toBe(true);
  expect(notifications.items.some((item:any)=>item.pageId===id)).toBe(false);
  await ok(author!.id,'POST','/api/analytics/views',{operationKey:createUlid(),pageId:control});
  await ok(author!.id,'POST','/api/analytics/views',{operationKey:createUlid(),pageId:id});
  expect((await ok(author!.id,'GET',`/api/analytics?pageId=${control}`)).totalViews).toBe(1);
  expect(await ok(author!.id,'GET',`/api/analytics?pageId=${id}`)).toMatchObject({totalViews:0,uniqueViewers:0,editors:[]});
  const report=await ok(owner!.id,'GET',`/api/analytics/reports?report=views&containerId=${containerId}`);
  expect(report.rows.map((item:any)=>item.pageId)).toEqual([control,homeId]);
  const exportBefore=await snapshot(),jobsBefore=await rows('portability_jobs');
  const exported=await request(owner!.id,'POST','/api/exports/jobs/workspace',{operationKey:createUlid()});
  expect(exported.status,exported.body).toBe(403);expect(JSON.parse(exported.body).code).toBe('EXPORT_SCOPE_INCOMPLETE');
  expect(await snapshot()).toEqual(exportBefore);expect(await rows('portability_jobs')).toEqual(jobsBefore);
  console.log('PROBE LIFE-002 exclusion: native populated search, query, tree, inbox and analytics -> live control present, draft absent; unauthorized complete export refused without creating a job');
  console.log('PROBE LIFE-002 1: native author, address grant and group sessions -> exact body and persisted grants; owner and outsider refused; same sessions refused after full revocation, replay unchanged');
  console.log('PROBE LIFE-002 2: both access profiles -> general grants and anonymous publication refused; content, grants, exposures, receipts and activity unchanged');
  console.log('PROBE LIFE-002 4: native lifecycle profile switches -> retained draft and named grants unchanged, author and grantees read, owner and anonymous refused');
}
