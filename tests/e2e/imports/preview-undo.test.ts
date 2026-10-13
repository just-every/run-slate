import {beforeEach,expect,it} from 'vitest';
import {env} from 'cloudflare:test';
import {createApi} from '../../../src/core/app/hono';
import {seedWorkspace,seedMember,sessionFor} from '../setup/fixtures';
import {resetDatabase} from '../setup/reset-database';

beforeEach(()=>resetDatabase(env.DB));
it.each([
 ['notion-workspace','notion-workspace-export.zip'],
 ['confluence-space','confluence-space-export.zip'],
])('reviews, applies and reverses real %s content without losing native edits',async(format,name)=>{
 const {workspaceId}=await seedWorkspace();
 const owner=await seedMember(workspaceId,{email:'owner@import.test',displayName:'Import owner',role:'owner',isSetupOwner:true});
 const mapped=await seedMember(workspaceId,{email:'mapped@import.test',displayName:'Mapped member',role:'member'});
 const other=await seedMember(workspaceId,{email:'other@import.test',displayName:'Other member',role:'member'});
 const guest=await seedMember(workspaceId,{email:'guest@import.test',displayName:'Guest',role:'member',isGuest:true});
 const cookie=await sessionFor(owner.memberId),app=createApi();
 const call=async(path:string,body?:unknown)=>{
  const response=await app.request(`https://slate.example/api/imports${path}`,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})},env);
  const data=await response.json() as any;
  expect(response.status,JSON.stringify(data)).toBe(200);return data;
 };
 const bytes=await (await (env as typeof env & {TEST_IMPORT_FIXTURES:Fetcher}).TEST_IMPORT_FIXTURES.fetch(`https://fixtures/${name}`)).arrayBuffer();
 const form=new FormData();form.set('file',new File([bytes],name));form.set('format',format);form.set('operationKey',crypto.randomUUID());
 const uploaded=await call('',form);let job=await call(`/${uploaded.id}/preview`,{});
 expect(job.state).toBe('preview');expect(job.report.wouldCreate.length).toBeGreaterThan(0);
 expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM pages').first('n')).toBe(0);
 expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM containers').first('n')).toBe(0);
 if(job.report.principals.length){job=await call(`/${job.id}/preview`,{mappings:job.report.principals.filter((p:any)=>p.kind==='member').map((p:any)=>({sourceId:p.sourceId,kind:'member',targetId:mapped.memberId}))});}
 const expectedPages=job.report.counts.pages;
 const assertPublishedCount=async()=>{const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM pages WHERE deleted_at IS NULL').first<number>('n');expect([0,expectedPages]).toContain(n);};
 const id=job.id;job=await call(`/${id}/apply`,{fingerprint:job.report.fingerprint});
 let hiddenChecked=false, atomicPublication=false;
 for(let n=0;job.state!=='completed'&&n<100;n++){
  await assertPublishedCount();
  const beforePublication=await env.DB.prepare('SELECT COUNT(*) AS n FROM pages').first<number>('n');
  job=await call(`/${id}/resume`,{});
  if(beforePublication===0&&['indexing','completed'].includes(job.state))atomicPublication=true;
  if(job.state==='running'&&!hiddenChecked){
   const staged=await env.DB.prepare('SELECT id,title,container_id FROM pages WHERE deleted_at IS NOT NULL LIMIT 1').first<{id:string;title:string;container_id:string}>();
   if(staged){
    expect((await app.request(`https://slate.example/api/pages/${staged.id}`,{headers:{Cookie:cookie}},env)).status).toBe(404);
    const search=await app.request(`https://slate.example/api/search?q=${encodeURIComponent(staged.title)}&includeTrashed=true&includeArchived=true`,{headers:{Cookie:cookie}},env);
    expect(JSON.stringify(await search.json())).not.toContain(staged.id);hiddenChecked=true;
   }
  }
 }
 await assertPublishedCount();
 expect(hiddenChecked||atomicPublication).toBe(true);
 if(format==='notion-workspace')expect(hiddenChecked).toBe(true);
 expect(job.state).toBe('completed');
 const pages=(await env.DB.prepare('SELECT id,title,revision_id,parent_page_id FROM pages WHERE workspace_id=? ORDER BY id').bind(workspaceId).all<{id:string;title:string;revision_id:string;parent_page_id:string|null}>()).results;
 expect(pages.length).toBeGreaterThan(1);expect(job.counts.pages).toBe(pages.length);
 expect(await env.DB.prepare('SELECT COUNT(DISTINCT page_id) AS n FROM search_text WHERE workspace_id=?').bind(workspaceId).first('n')).toBe(pages.length);
 if(format==='confluence-space'){
  const restricted=await env.DB.prepare("SELECT p.id,p.title FROM pages p JOIN page_grants g ON g.page_id=p.id WHERE p.access_inheritance='restricted' AND g.principal_kind='member' AND g.principal_id=? LIMIT 1").bind(mapped.memberId).first<{id:string;title:string}>();
  expect(restricted).toBeTruthy();
  for(const [memberId,allowed] of [[owner.memberId,true],[mapped.memberId,true],[other.memberId,false],[guest.memberId,false]] as const){
   const accessCookie=await sessionFor(memberId);
   const page=await app.request(`https://slate.example/api/pages/${restricted!.id}`,{headers:{Cookie:accessCookie}},env);expect(page.status).toBe(allowed?200:404);
   const search=await app.request(`https://slate.example/api/search?q=${encodeURIComponent(restricted!.title)}`,{headers:{Cookie:accessCookie}},env);
   const result=await search.json() as {items:{id:string}[]};expect(result.items.some(item=>item.id===restricted!.id)).toBe(allowed);
  }
  expect((await app.request(`https://slate.example/api/pages/${restricted!.id}`,{},env)).status).toBe(401);
 }
 const downloaded=await app.request(`https://slate.example/api/imports/${id}/original`,{headers:{Cookie:cookie}},env);
 expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(new Uint8Array(bytes));
 const edited=pages.find(p=>!pages.some(child=>child.parent_page_id===p.id))!;
 const independent=await env.DB.prepare('SELECT p.id FROM pages p WHERE p.workspace_id=? AND p.id!=? AND NOT EXISTS(SELECT 1 FROM pages child WHERE child.parent_page_id=p.id) AND NOT EXISTS(SELECT 1 FROM files f WHERE f.page_id=p.id) AND NOT EXISTS(SELECT 1 FROM databases d WHERE d.page_id=p.id) ORDER BY p.id LIMIT 1').bind(workspaceId,edited.id).first<{id:string}>();expect(independent).toBeTruthy();
 const response=await app.request(`https://slate.example/api/pages/${edited.id}`,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({operationKey:crypto.randomUUID(),expectedRevisionId:edited.revision_id,properties:{title:'Native edit survives import undo'}})},env);
 expect(response.status,await response.text()).toBe(200);
 job=await call(`/${id}/undo`,{});
 for(let n=0;job.state!=='undone'&&n<100;n++)job=await call(`/${id}/resume`,{});
 expect(job.state).toBe('undone');
 const conflicts=[];for(let page=0;page<(job.report.sections?.conflicts?.pages??0);page++)conflicts.push(...(await call(`/${id}/report/conflicts?page=${page}`)).items);
 expect(conflicts.some((c:any)=>c.targetId===edited.id&&c.code==='NATIVE_EDIT_CONFLICT')).toBe(true);
 expect(await env.DB.prepare('SELECT title FROM pages WHERE id=?').bind(edited.id).first('title')).toBe('Native edit survives import undo');
 expect(await env.DB.prepare('SELECT id FROM pages WHERE id=?').bind(independent!.id).first('id')).toBeNull();
 expect((await app.request(`https://slate.example/api/pages/${independent!.id}`,{headers:{Cookie:cookie}},env)).status).toBe(404);
 expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM pages WHERE workspace_id=?').bind(workspaceId).first<number>('n')).toBeLessThan(pages.length);
},120_000);
