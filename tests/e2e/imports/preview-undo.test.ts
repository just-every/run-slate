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

it.each(['historical','shared across imports'] as const)('erases an imported person (%s) through confirmed native removal, atomically retires custody and keeps unrelated Undo',async(mode)=>{
 const {developmentOutbox}=await import('../../../src/core/app/development-outbox');
 const {installationRedactionStatements}=await import('../../../src/core/features/portability/checkpoint');
 const {createPortability}=await import('@runeditrun/rer/modules/portability');
 const {workspaceId}=await seedWorkspace();
 const owner=await seedMember(workspaceId,{email:'custody-owner@example.org',displayName:'Custody owner',role:'owner',isSetupOwner:true});
 const cookie=await sessionFor(owner.memberId),app=createApi(),origin='http://localhost:8787',host='localhost:8787';
 const bindings={...env,APP_URL:origin,LOCAL_DEVELOPMENT:'true',MAIL_PROVIDER:'development',RER_DEV_KEY:'test-custody-dev-key-'.padEnd(43,'k')};
 const request=(path:string,body?:unknown)=>app.request(origin+path,{method:body===undefined?'GET':'POST',headers:{host,origin,Cookie:cookie,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})},bindings);
 const call=async(path:string,body?:unknown)=>{const response=await request(path,body),data=await response.json() as any;expect(response.status,JSON.stringify(data)).toBe(200);return data;};
 let sharedPerson:{id:string;email:string;display_name:string}|undefined;
 const importArchive=async(format:string,name:string,sharePerson=false)=>{
  const bytes=await (await (env as typeof env&{TEST_IMPORT_FIXTURES:Fetcher}).TEST_IMPORT_FIXTURES.fetch(`https://fixtures/${name}`)).arrayBuffer();
  const form=new FormData();form.set('file',new File([bytes],name));form.set('format',format);form.set('operationKey',crypto.randomUUID());
  let job=await call('/api/imports',form);job=await call(`/api/imports/${job.id}/preview`,{});
  if(sharePerson){
   const person=job.report.principals.find((p:any)=>p.kind==='member');expect(person).toBeTruthy();
   if(!sharedPerson){const email='erased-import@example.org',member=await seedMember(workspaceId,{email,displayName:person.label,role:'member'});sharedPerson={id:member.memberId,email,display_name:person.label};}
   job=await call(`/api/imports/${job.id}/preview`,{mappings:[{sourceId:person.sourceId,kind:'member',targetId:sharedPerson.id}]});
  }
  job=await call(`/api/imports/${job.id}/apply`,{fingerprint:job.report.fingerprint});
  for(let n=0;job.state!=='completed'&&n<150;n++)job=await call(`/api/imports/${job.id}/resume`,{});
  expect(job.state).toBe('completed');return job;
 };
 const affected=[await importArchive('confluence-space','confluence-space-export.zip',mode==='shared across imports')];
 if(sharedPerson)affected.push(await importArchive('confluence-space','confluence-space-export.zip',true));
 const affectedIds=JSON.stringify(affected.map(job=>job.id));
 const people=(await env.DB.prepare("SELECT * FROM members WHERE workspace_id=? AND status='historical' ORDER BY id").bind(workspaceId).all<{id:string;email:string;display_name:string}>()).results;
 expect(people.length).toBeGreaterThan(1);const erased=sharedPerson??people[0]!,retained=people[sharedPerson?0:1]!;
 const pagesBefore=(await env.DB.prepare('SELECT * FROM pages WHERE workspace_id=? ORDER BY id').bind(workspaceId).all()).results;
 const blocksBefore=(await env.DB.prepare('SELECT * FROM page_blocks ORDER BY id').all()).results;
 const control=await importArchive('notion-workspace','notion-workspace-export.zip');
 const controlPages=(await env.DB.prepare("SELECT p.id,p.revision_id FROM pages p JOIN import_native_targets t ON t.target_id=p.id WHERE t.import_id=? AND t.kind='page'").bind(control.id).all<{id:string;revision_id:string}>()).results;
 const edited=controlPages[0]!;
 const editedResponse=await app.request(origin+`/api/pages/${edited.id}`,{method:'PATCH',headers:{host,origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({operationKey:crypto.randomUUID(),expectedRevisionId:edited.revision_id,properties:{title:'Native edit after unrelated import'}})},bindings);
 expect(editedResponse.status,await editedResponse.text()).toBe(200);
 const keys=(await env.DB.prepare("SELECT storage_key FROM import_objects WHERE import_id IN (SELECT value FROM json_each(?)) AND kind!='media'").bind(affectedIds).all<{storage_key:string}>()).results.map(row=>row.storage_key);
 expect(keys.length).toBeGreaterThan(0);for(const key of keys)expect(await env.FILES.head(key)).not.toBeNull();
 const custody=async()=>JSON.stringify((await env.DB.prepare('SELECT * FROM import_native_targets WHERE import_id IN (SELECT value FROM json_each(?)) ORDER BY import_id,kind,target_id').bind(affectedIds).all()).results);
 const custodyBefore=await custody();
 expect(custodyBefore).toContain(sharedPerson?erased.id:erased.display_name);expect(custodyBefore).toContain(retained.display_name);
 const removal={operationKey:crypto.randomUUID(),memberId:erased!.id,erase:true};
 const refused=await request('/api/members/remove',removal);expect(refused.status).toBe(403);expect(await refused.json()).toMatchObject({code:'STEP_UP_REQUIRED'});
 expect(await custody()).toBe(custodyBefore);
 const outbox=(path:string)=>developmentOutbox(new Request(origin+path,{headers:{host,'x-rer-dev-key':bindings.RER_DEV_KEY}}),bindings);
 const listing=await outbox('/__dev/outbox');expect(listing?.status).toBe(200);
 const article=(await listing!.text()).split('<article>').find(part=>part.includes('To: custody-owner@example.org</p>'))!;
 const detail=await outbox(article.match(/href="(\/__dev\/outbox\?message=[^"]+)"/)![1]!.replaceAll('&amp;','&'));
 const link=new URL((await detail!.text()).match(/class="open" href="([^"<>]+)"/)![1]!.replaceAll('&amp;','&'));
 const confirmed=await app.request(origin+'/auth/confirm',{method:'POST',headers:{host,origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:link.searchParams.get('token')!})},bindings);
 expect(confirmed.status).toBe(303);
 // Initialize storage before comparing the final-guard failure. No checkpoint
 // statements execute here: the last-owner SQL guard must roll all of them back.
 await env.DB.exec("CREATE TABLE _rer_deploy_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,state TEXT NOT NULL); INSERT INTO _rer_deploy_migrations VALUES('0001_core.sql','controller-owned-test-identity','applied')");
 const ledgerBefore=(await env.DB.prepare('SELECT * FROM _rer_deploy_migrations').all()).results;
 await installationRedactionStatements(env.DB,env.FILES);
 // A real completed Base export retains snapshot tables until erasure retires
 // them. Repeating its DROP statements for two imports must never abort removal.
 const portability=await createPortability({db:env.DB,policy:{product:'just-every/slate',excludeTables:['%'],includeTables:['workspaces','members']}});
 const exportId=await portability.exports.create(owner.memberId);
 let exported=await portability.exports.advance(exportId,{maxParts:100});
 for(let n=0;exported.phase!=='complete'&&n<10;n++)exported=await portability.exports.advance(exportId,{maxParts:100});
 expect(exported.phase).toBe('complete');
 const transferTables=async()=>(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*' ORDER BY name").all<{name:string}>()).results;
 const retainedSnapshots=await transferTables();expect(retainedSnapshots.length).toBeGreaterThan(0);
 const epochBefore=await env.DB.prepare('SELECT epoch FROM rer_portability_state WHERE id=1').first<number>('epoch');
 const snapshot=async()=>JSON.stringify(await Promise.all(['ik_jobs','ik_d1_erasure_journal','ik_d1_retirements','rer_portability_state','rer_portability_epochs','rer_portability_journal','rer_portability_jobs','rer_portability_parts','rer_portability_segments','federation_imports','import_native_targets',...retainedSnapshots.map(row=>row.name)].map(async table=>[table,(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])));
 const beforeGuard=await snapshot();
 const lastOwner=await request('/api/members/remove',{operationKey:crypto.randomUUID(),memberId:owner.memberId,erase:true});
 expect(lastOwner.status,await lastOwner.text()).toBe(409);expect(await snapshot()).toBe(beforeGuard);
 expect(await transferTables()).toEqual(retainedSnapshots);
 expect((await call('/api/members/remove',removal)).value.erased).toBe(true);
 expect(await env.DB.prepare('SELECT epoch FROM rer_portability_state WHERE id=1').first('epoch')).toBe(epochBefore!+1);
 expect(await transferTables()).toEqual([]);
 await expect(portability.exports.download(exportId)).rejects.toMatchObject({code:'job_not_found'});
 expect(await env.DB.prepare('SELECT * FROM members WHERE id=?').bind(retained!.id).first()).toEqual(retained);
 expect((await env.DB.prepare('SELECT * FROM pages WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(JSON.stringify(pagesBefore.map(row=>row.id))).all()).results).toEqual(pagesBefore);
 expect((await env.DB.prepare('SELECT * FROM page_blocks WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(JSON.stringify(blocksBefore.map(row=>row.id))).all()).results).toEqual(blocksBefore);
 const stores=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'ik_*' OR name IN ('import_native_targets','federation_imports','federation_import_mappings')) ORDER BY name").all<{name:string}>()).results;
 for(const {name} of stores){const body=JSON.stringify((await env.DB.prepare(`SELECT * FROM ${name}`).all()).results);expect(body,name).not.toContain(erased!.display_name);expect(body,name).not.toContain(erased!.email);}
 for(const key of keys)expect(await env.FILES.head(key),key).toBeNull();
 for(const job of affected){
  expect(await env.DB.prepare('SELECT count(*) n FROM ik_d1_erasure_journal WHERE destination=?').bind(job.id).first('n')).toBe(1);
  expect(await env.DB.prepare('SELECT count(*) n FROM ik_jobs WHERE destination=?').bind(job.id).first('n')).toBe(0);
  const retiredResume=await request(`/api/imports/${job.id}/resume`,{});expect(retiredResume.status).toBe(409);expect(await retiredResume.json()).toMatchObject({code:'IMPORT_SOURCE_ERASED'});
 }
 expect(await env.DB.prepare('SELECT count(*) n FROM ik_jobs WHERE destination=?').bind(control.id).first<number>('n')).toBeGreaterThan(0);
 let undo=await call(`/api/imports/${control.id}/undo`,{});for(let n=0;undo.state!=='undone'&&n<150;n++)undo=await call(`/api/imports/${control.id}/resume`,{});
 expect(undo.state).toBe('undone');expect(await env.DB.prepare('SELECT title FROM pages WHERE id=?').bind(edited.id).first('title')).toBe('Native edit after unrelated import');
 expect((await env.DB.prepare('SELECT * FROM _rer_deploy_migrations').all()).results).toEqual(ledgerBefore);
 await env.DB.exec('DROP TABLE _rer_deploy_migrations');
 expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
},180_000);
