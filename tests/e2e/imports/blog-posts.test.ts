import {providerFolderJourney} from './provider-folder-journey';
import {contract} from '../contract';
import {beforeEach,expect,it} from 'vitest';
import {env} from 'cloudflare:test';
import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';
import {createApi} from '../../../src/core/app/hono';
import {seedWorkspace,seedMember,sessionFor} from '../setup/fixtures';
import {resetDatabase} from '../setup/reset-database';

beforeEach(async()=>{await resetDatabase(env.DB);await env.DB.exec('DROP TABLE IF EXISTS _rer_deploy_migrations');});

/** The committed Cloud export has no blog post, so one is appended in the exporter's own columns. */
function withBlogPost(bytes:Uint8Array){
 const files=unzipSync(bytes);
 const append=(name:string,values:Record<string,string>)=>{
  const text=strFromU8(files[name]!),eol=text.includes('\r\n')?'\r\n':'\n',columns=text.slice(0,text.indexOf(eol)).split(',');
  files[name]=strToU8(`${text.endsWith(eol)?text:text+eol}${columns.map(column=>values[column]??'').join(',')}${eol}`);
 };
 const author='100001:d9d99555-7c2d-5fc9-9d5f-444042ec9317';
 append('content.csv.gz',{contentid:'990001',hibernateversion:'1',contenttype:'BLOGPOST',title:'Launch week notes',lowertitle:'launch week notes',version:'1',creator:author,creationdate:'2025-03-04 09:15:00.000',lastmodifier:author,lastmoddate:'2025-03-05 10:00:00.000',content_status:'current',spaceid:'163842'});
 append('bodycontent.csv.gz',{bodycontentid:'990002',body:'<p>Launch week starts Monday.</p>',contentid:'990001',bodytypeid:'2'});
 return zipSync(files);
}

it('CONT-010 — a Confluence Cloud blog post imports as a post with its date and author, and undo removes it',async()=>{
 const {workspaceId}=await seedWorkspace();
 const owner=await seedMember(workspaceId,{email:'owner@import.test',displayName:'Import owner',role:'owner',isSetupOwner:true});
 const mapped=await seedMember(workspaceId,{email:'mapped@import.test',displayName:'Mapped member',role:'member'});
 const cookie=await sessionFor(owner.memberId),app=createApi();
 const call=async(path:string,body?:unknown)=>{
  const response=await app.request(`https://slate.example${path}`,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})},env);
  const data=await response.json() as any;expect(response.status,JSON.stringify(data)).toBe(200);return data;
 };
 const fixture=new Uint8Array(await (await (env as typeof env & {TEST_IMPORT_FIXTURES:Fetcher}).TEST_IMPORT_FIXTURES.fetch('https://fixtures/confluence-space-export.zip')).arrayBuffer());
 const form=new FormData();form.set('file',new File([withBlogPost(fixture)],'confluence-space-export.zip'));form.set('format','confluence-space');form.set('operationKey',crypto.randomUUID());
 let job=await call('/api/imports',form);job=await call(`/api/imports/${job.id}/preview`,{});
 expect(JSON.stringify(job.report)).not.toContain('blogpost has no Slate equivalent');
 job=await call(`/api/imports/${job.id}/preview`,{mappings:job.report.principals.filter((p:any)=>p.kind==='member').map((p:any)=>({sourceId:p.sourceId,kind:'member',targetId:mapped.memberId}))});
 const id=job.id;job=await call(`/api/imports/${id}/apply`,{fingerprint:job.report.fingerprint});
 for(let n=0;job.state!=='completed'&&n<150;n++)job=await call(`/api/imports/${id}/resume`,{});
 expect(job.state).toBe('completed');
 const post=await env.DB.prepare("SELECT p.id,p.container_id,b.posted_at,b.author_member_id FROM blog_posts b JOIN pages p ON p.id=b.page_id WHERE p.title='Launch week notes'").first<{id:string;container_id:string;posted_at:string;author_member_id:string}>();
 expect(post).toMatchObject({posted_at:'2025-03-04T09:15:00.000Z',author_member_id:mapped.memberId});
 expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM blog_posts').first('n')).toBe(1);
 const feed=await call(`/api/blog?containerId=${post!.container_id}`);
 expect(feed.items.map((item:any)=>[item.title,item.postedAt,item.authorName])).toEqual([['Launch week notes','2025-03-04T09:15:00.000Z','Mapped member']]);
 expect((await call(`/api/pages/${post!.id}`)).blocks.map((block:any)=>block.content.text?.[0]?.text)).toContain('Launch week starts Monday.');
 job=await call(`/api/imports/${id}/undo`,{});
 for(let n=0;job.state!=='undone'&&n<100;n++)job=await call(`/api/imports/${id}/resume`,{});
 expect(job.state).toBe('undone');
 expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM blog_posts').first('n')).toBe(0);
},120_000);

contract('IMP-009','Member folder imports preserve a nested twelve-document tree, resolving links and actor-only access with a per-file omission report',providerFolderJourney);
