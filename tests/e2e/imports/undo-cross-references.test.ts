import {beforeEach,expect,it} from 'vitest';
import {env} from 'cloudflare:test';
import {createApi} from '../../../src/core/app/hono';
import {seedWorkspace,seedMember,sessionFor} from '../setup/fixtures';
import {resetDatabase} from '../setup/reset-database';

beforeEach(()=>resetDatabase(env.DB));
// The scale Server/DC archive streams its pages and their attachments in
// separate children, and its first three pages embed each other's attachments
// in a cycle: Root embeds Guide's file, Guide Record's, Record Root's.
it('Undo removes unedited and merely shared imported pages and keeps an edited page with every page and file it needs',async()=>{
 const {workspaceId}=await seedWorkspace();
 const owner=await seedMember(workspaceId,{email:'owner@import.test',displayName:'Import owner',role:'owner',isSetupOwner:true});
 const reader=await seedMember(workspaceId,{email:'scale-reader@example.test',displayName:'Scale reader',role:'member'});
 const colleague=await seedMember(workspaceId,{email:'colleague@import.test',displayName:'Colleague',role:'member'});
 const cookie=await sessionFor(owner.memberId),app=createApi();
 const request=async(path:string,body?:unknown,method=body===undefined?'GET':'POST')=>{
  const response=await app.request(`https://slate.example${path}`,{method,headers:{Cookie:cookie,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})},env);
  const data=await response.json() as any;
  expect(response.status,JSON.stringify(data).slice(0,400)).toBe(200);return data;
 };
 const count=async(sql:string)=>(await env.DB.prepare(sql).bind(workspaceId).first<number>('n'))!;
 const name='server-dc-entities-scale.zip';
 const bytes=await (await (env as typeof env & {TEST_IMPORT_FIXTURES:Fetcher}).TEST_IMPORT_FIXTURES.fetch(`https://fixtures/${name}`)).arrayBuffer();
 const form=new FormData();form.set('file',new File([bytes],name));form.set('format','confluence-space');form.set('operationKey',crypto.randomUUID());
 const uploaded=await request('/api/imports',form);let job=await request(`/api/imports/${uploaded.id}/preview`,{});
 const known=job.report.principals.find((p:any)=>p.label==='Scale reader');
 job=await request(`/api/imports/${job.id}/preview`,{mappings:[{sourceId:known.sourceId,kind:'member',targetId:reader.memberId}]});
 const id=job.id;job=await request(`/api/imports/${id}/apply`,{fingerprint:job.report.fingerprint});
 for(let n=0;job.state!=='completed'&&n<1000;n++)job=await request(`/api/imports/${id}/resume`,{});
 expect(job.state).toBe('completed');
 const pages=Object.fromEntries((await env.DB.prepare("SELECT title,id,revision_id FROM pages WHERE workspace_id=? AND title LIKE 'Scale 0001 %'").bind(workspaceId).all<{title:string;id:string;revision_id:string}>()).results.map(p=>[p.title,p]));
 const root=pages['Scale 0001 Root']!,guide=pages['Scale 0001 Guide']!,record=pages['Scale 0001 Record']!;
 const shared=(await env.DB.prepare("SELECT id FROM pages WHERE workspace_id=? AND title='Scale 0002 Guide'").bind(workspaceId).first<string>('id'))!;
 const fileOf=async(pageId:string)=>(await env.DB.prepare('SELECT id FROM files WHERE page_id=?').bind(pageId).first<string>('id'))!;
 const files={root:await fileOf(root.id),guide:await fileOf(guide.id),record:await fileOf(record.id)};
 expect(await count('SELECT COUNT(*) AS n FROM files WHERE workspace_id=?')).toBe(3);
 // Sharing the imported space is access, not an edit of its content.
 const container=(await env.DB.prepare('SELECT container_id FROM pages WHERE id=?').bind(root.id).first<string>('container_id'))!;
 await request('/api/sharing',{operationKey:crypto.randomUUID(),targetKind:'container',targetId:container,principalKind:'member',principalId:colleague.memberId,level:'view'});
 // So is sharing one unedited page: the share and its notice go with the page.
 await request('/api/sharing',{operationKey:crypto.randomUUID(),targetKind:'page',targetId:shared,principalKind:'member',principalId:colleague.memberId,level:'edit'});
 expect(await count(`SELECT COUNT(*) AS n FROM notifications WHERE workspace_id=? AND source_page_id='${shared}'`)).toBe(1);
 // A member edits one page, which links its parent's attachment.
 const edit=await app.request(`https://slate.example/api/pages/${record.id}`,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({operationKey:crypto.randomUUID(),expectedRevisionId:record.revision_id,properties:{title:'Native edit survives import undo'}})},env);
 expect(edit.status,await edit.text()).toBe(200);
 job=await request(`/api/imports/${id}/undo`,{});
 for(let n=0;job.state!=='undone'&&n<1000;n++)job=await request(`/api/imports/${id}/resume`,{});
 expect(job.state).toBe('undone');
 const conflicts:any[]=[];for(let page=0;page<(job.report.sections?.conflicts?.pages??0);page++)conflicts.push(...(await request(`/api/imports/${id}/report/conflicts?page=${page}`)).items);
 // The edited page is kept as an edit. What it needs stays: its parent, every
 // file a kept page embeds, and the page each kept file belongs to, so no kept
 // page shows a broken file. Everything else the import created is gone.
 expect((await env.DB.prepare('SELECT id FROM pages WHERE workspace_id=? ORDER BY id').bind(workspaceId).all<{id:string}>()).results.map(p=>p.id)).toEqual([root.id,guide.id,record.id].sort());
 expect((await env.DB.prepare('SELECT id FROM files ORDER BY id').all<{id:string}>()).results.map(f=>f.id)).toEqual([files.root,files.guide,files.record].sort());
 expect(conflicts.find(c=>c.targetId===record.id)).toMatchObject({code:'NATIVE_EDIT_CONFLICT',reason:'edited'});
 for(const target of [root.id,guide.id,files.root,files.guide,files.record,container])expect(conflicts.find(c=>c.targetId===target)).toMatchObject({reason:'dependency'});
 expect(conflicts.find(c=>c.targetId===shared)).toBeUndefined();
 expect(await count(`SELECT COUNT(*) AS n FROM notifications WHERE workspace_id=? AND source_page_id='${shared}'`)).toBe(0);
 expect(conflicts.filter(c=>c.code==='NATIVE_EDIT_CONFLICT').map(c=>c.targetId)).toEqual([record.id]);
},1_800_000);
