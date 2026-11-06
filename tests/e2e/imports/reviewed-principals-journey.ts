import {expect} from 'vitest';
import {env} from 'cloudflare:test';
import {createApi} from '../../../src/core/app/hono';
import {parseImport} from '../../../src/core/features/imports';
import {seedWorkspace,seedMember,sessionFor} from '../setup/fixtures';

/** Genuine incumbent source; only destination identities and authority change. */
export async function reviewedPrincipalsJourney(reset:()=>Promise<void>) {
 await reset();
 const name='confluence-space-export.zip';
 const bytes=new Uint8Array(await (await (env as typeof env&{TEST_IMPORT_FIXTURES:Fetcher}).TEST_IMPORT_FIXTURES.fetch(`https://fixtures/${name}`)).arrayBuffer());
 const parsed=parseImport('confluence-space',{name,bytes});
 const source=parsed.pages.flatMap(page=>page.grants).find(grant=>!grant.general&&grant.principalKind==='member')!;
 expect(source).toBeTruthy();
 const sourcePerson=parsed.members.find(person=>person.sourceId===source.principalSourceId)!;
 const {workspaceId}=await seedWorkspace(),foreign=await seedWorkspace();
 const email=(n:number)=>[`synthetic-slate-${n}`,'example.test'].join('@');
 const owner=await seedMember(workspaceId,{email:email(41),displayName:'Import owner',role:'owner',isSetupOwner:true});
 const importer=await seedMember(workspaceId,{email:email(42),displayName:'Importing member',role:'member'});
 const mapped=await seedMember(workspaceId,{email:email(43),displayName:'Reviewed member',role:'member'});
 const collision=await seedMember(workspaceId,{email:email(44),displayName:sourcePerson.displayName,role:'member'});
 const outside=await seedMember(foreign.workspaceId,{email:email(45),displayName:sourcePerson.displayName,role:'member'});
 await env.DB.prepare("UPDATE workspaces SET member_container_creation='allowed' WHERE id=?").bind(workspaceId).run();
 const cookie=await sessionFor(importer.memberId),ownerCookie=await sessionFor(owner.memberId),mappedCookie=await sessionFor(mapped.memberId),collisionCookie=await sessionFor(collision.memberId),app=createApi();
 const request=(path:string,body?:unknown,as:string|undefined=cookie)=>app.request('https://slate.example/api'+path,{method:body===undefined?'GET':'POST',headers:{...(as?{Cookie:as}:{}),...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})},env);
 const ok=async(path:string,body?:unknown)=>{const response=await request(path,body),value=await response.json<any>();expect(response.status,JSON.stringify(value)).toBe(200);return value;};
 const form=new FormData();form.set('file',new File([bytes as Uint8Array<ArrayBuffer>],name));form.set('format','confluence-space');form.set('operationKey',crypto.randomUUID());
 const staged=await ok('/imports',form),base=`/imports/${staged.id}`;
 let job=await ok(base+'/preview',{});
 expect(job.report.mappings).toEqual([]);
 expect(job.report.access.historicalMembers).toBe(parsed.members.length);
 const principals=async()=>(await env.DB.prepare('SELECT id,workspace_id,email,display_name,role,status,member_kind FROM members ORDER BY id').all()).results;
 const activeBefore=await principals();
 const snapshot=async()=>{
  const rows:Record<string,unknown>={members:await principals()};
  for(const table of ['groups','group_members','containers','container_grants','pages','page_blocks','page_grants','page_revisions','public_exposures','federation_import_mappings','import_native_targets','ik_jobs','ik_d1_streams','ik_d1_staging','operation_receipts','activity_entries'])rows[table]=(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results;
  rows.job=await env.DB.prepare('SELECT state,kit_id,native_published,progress_json,mapping_json,report_json,revision_id FROM federation_imports WHERE id=?').bind(staged.id).first();
  return rows;
 };
 const refusals:{action:string;status:number;code:string;state:string}[]=[];
 const refuse=async(action:string,body:unknown,status:number,code:string,as=cookie)=>{
  const before=await snapshot(),response=await request(base+'/'+action,body,as),failure=await response.json<any>();
  expect(response.status,JSON.stringify(failure)).toBe(status);expect(failure.code).toBe(code);expect(await snapshot()).toEqual(before);refusals.push({action,status,code,state:(before.job as {state:string}).state});
 };
 const mapping={sourceId:source.principalSourceId,kind:'member',targetId:mapped.memberId};
 for(const targetId of [outside.memberId,email(43),'Reviewed member','synthetic-slate-unavailable'])await refuse('preview',{mappings:[{...mapping,targetId}]},409,'IMPORT_MAPPING_UNAVAILABLE');
 for(const invalid of [[{...mapping,sourceId:email(43)}],[{...mapping,sourceId:'Reviewed member'}],[{...mapping,kind:'group'}],[mapping,mapping]])await refuse('preview',{mappings:invalid},400,'IMPORT_MAPPING_INVALID');
 job=await ok(base+'/preview',{mappings:[mapping]});
 expect(job.report.mappings).toEqual([mapping]);
 expect(job.report.access.historicalMembers).toBe(parsed.members.length-1);
 const expectedAccess=job.report.access;
 const warnings=[];for(let page=0;page<job.report.sections.warnings.pages;page++)warnings.push(...(await ok(base+`/report/warnings?page=${page}`)).items);
 expect(warnings).toContainEqual(expect.objectContaining({label:'Source edit restrictions',detail:expect.stringContaining('conservatively close native page inheritance')}));
 // Each public action starts from a retained review, never a reconstructed plan.
 const recheck=async(action:'apply'|'resume')=>{
  const body=action==='apply'?{fingerprint:job.report.fingerprint}:{};
  for(const status of ['removed','historical']){
   await env.DB.prepare('UPDATE members SET status=? WHERE id=?').bind(status,mapped.memberId).run();
   await refuse(action,body,409,'IMPORT_MAPPING_UNAVAILABLE');
   await env.DB.prepare("UPDATE members SET status='active' WHERE id=?").bind(mapped.memberId).run();
  }
  await env.DB.prepare("UPDATE members SET member_kind='guest',guest_expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").bind(mapped.memberId).run();
  await refuse(action,body,409,'IMPORT_MAPPING_UNAVAILABLE');
  const unavailable=await ok(base);expect(unavailable.report.candidates.members.some((person:any)=>person.id===mapped.memberId)).toBe(false);
  await env.DB.prepare("UPDATE members SET member_kind='member',guest_expires_at=NULL WHERE id=?").bind(mapped.memberId).run();
  await env.DB.prepare('UPDATE members SET workspace_id=? WHERE id=?').bind(foreign.workspaceId,mapped.memberId).run();
  await refuse(action,body,409,'IMPORT_MAPPING_UNAVAILABLE');
  await env.DB.prepare('UPDATE members SET workspace_id=? WHERE id=?').bind(workspaceId,mapped.memberId).run();
  await env.DB.prepare("UPDATE workspaces SET member_container_creation='forbidden' WHERE id=?").bind(workspaceId).run();
  await refuse(action,body,403,'FORBIDDEN');
  await env.DB.prepare("UPDATE workspaces SET member_container_creation='allowed' WHERE id=?").bind(workspaceId).run();
  await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(importer.memberId).run();
  await refuse(action,body,401,'UNAUTHENTICATED');
  await env.DB.prepare("UPDATE members SET status='active' WHERE id=?").bind(importer.memberId).run();
  await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE member_id=?').bind(new Date().toISOString(),importer.memberId).run();
  await refuse(action,body,401,'UNAUTHENTICATED');
  await env.DB.prepare('UPDATE sessions SET revoked_at=NULL WHERE member_id=?').bind(importer.memberId).run();
  await refuse(action,body,404,'NOT_FOUND',ownerCookie);
 };
 await recheck('apply');
 job=await ok(base+'/apply',{fingerprint:job.report.fingerprint});expect(job.state).toBe('preparing');
 await recheck('resume');
 for(let n=0;job.state==='preparing'&&n<40;n++)job=await ok(base+'/resume',{});
 expect(job.state).toBe('running');
 await recheck('resume');
 job=await ok(base+'/resume',{});
 expect(job.state).toBe('running');expect(job.progress.checkpoint).toBeGreaterThan(0);
 // A second batch must not trust authority from the first committed checkpoint.
 await recheck('resume');
 for(let n=0;job.state!=='completed'&&n<80;n++)job=await ok(base+'/resume',{});
 expect(job.state).toBe('completed');expect(job.report.access).toEqual(expectedAccess);
 expect((await principals()).filter((row:any)=>row.status!=='historical')).toEqual(activeBefore);
 const links=(await env.DB.prepare("SELECT source_id,target_id FROM federation_import_mappings WHERE import_job_id=? AND source_kind='member' ORDER BY source_id").bind(staged.id).all<{source_id:string;target_id:string}>()).results;
 // Existing members are retained reviewed mappings, not imported creations.
 const resolved=[...links,...job.report.mappings.filter((item:any)=>item.kind==='member').map((item:any)=>({source_id:item.sourceId,target_id:item.targetId}))] as {source_id:string;target_id:string}[];
 expect(resolved.map(link=>link.source_id).sort()).toEqual(parsed.members.map(person=>person.sourceId).sort());
 expect(resolved.find(link=>link.source_id===source.principalSourceId)?.target_id).toBe(mapped.memberId);
 const historical=(await env.DB.prepare("SELECT id,display_name,status,role FROM members WHERE workspace_id=? AND status='historical' ORDER BY id").bind(workspaceId).all<{id:string;display_name:string;status:string;role:string}>()).results;
 expect(historical.map(person=>person.display_name).sort()).toEqual(parsed.members.filter(person=>person.sourceId!==source.principalSourceId).map(person=>person.displayName).sort());
 for(const person of historical){expect(person).toMatchObject({status:'historical',role:'member'});expect(await env.DB.prepare('SELECT COUNT(*) n FROM sessions WHERE member_id=?').bind(person.id).first('n')).toBe(0);}
 const pages=(await env.DB.prepare("SELECT id,title,access_inheritance FROM pages WHERE workspace_id=? ORDER BY id").bind(workspaceId).all<{id:string;title:string;access_inheritance:string}>()).results;
 expect(pages).toHaveLength(parsed.pages.length);
 const sourceRestricted=parsed.pages.filter(page=>page.restricted||page.grants.some(grant=>!grant.general));
 expect(pages.filter(page=>page.access_inheritance==='restricted')).toHaveLength(sourceRestricted.length);
 for(const page of pages){
  const sourcePage=parsed.pages.find(item=>item.title===page.title)!;
  const named=sourcePage.grants.filter(grant=>!grant.general);
  const grants=(await env.DB.prepare('SELECT principal_kind,principal_id,level FROM page_grants WHERE page_id=? ORDER BY principal_kind,principal_id,level').bind(page.id).all()).results;
  expect(grants).toEqual([
   {principal_kind:'member',principal_id:importer.memberId,level:'full'},
   ...named.map(grant=>({principal_kind:grant.principalKind,principal_id:resolved.find(link=>link.source_id===grant.principalSourceId)!.target_id,level:grant.level})),
  ].sort((a,b)=>a.principal_kind.localeCompare(b.principal_kind)||a.principal_id.localeCompare(b.principal_id)||a.level.localeCompare(b.level)));
  for(const [as,allowed] of [[cookie,true],[mappedCookie,true],[collisionCookie,false]] as const){const response=await request('/pages/'+page.id,undefined,as);expect(response.status).toBe(allowed?200:404);}
  const anonymous=await app.request('https://slate.example/api/pages/'+page.id,{},env);expect(anonymous.status).toBe(401);expect(await anonymous.text()).not.toContain(page.title);
  const published=await app.request('https://slate.example/p/'+page.id,{},env);expect(published.status).toBe(404);expect(await published.text()).not.toContain(page.title);
 }
 expect((await env.DB.prepare('SELECT * FROM public_exposures').all()).results).toEqual([]);
 const completed=await snapshot();await ok(base+'/apply',{fingerprint:job.report.fingerprint});await ok(base+'/resume',{});expect(await snapshot()).toEqual(completed);
 console.info('IMPORT_PRINCIPAL_RECEIPT '+JSON.stringify({jobId:staged.id,state:job.state,refusals,principals:resolved.map(link=>({...link,status:link.target_id===mapped.memberId?'active':'historical'})),pages,grants:(await env.DB.prepare('SELECT page_id,principal_kind,principal_id,level FROM page_grants ORDER BY page_id,principal_id,level').all()).results,access:job.report.access,warnings:warnings.filter(item=>item.label==='Source edit restrictions'),exposures:(await env.DB.prepare('SELECT * FROM public_exposures').all()).results}));
 console.info('PROBE IMP-016 2: genuine Confluence Preview, Apply, Preparing and two native batch checkpoints -> unsafe mapping, changed workspace, removed member, lost creation authority, removed actor, revoked session and another actor refused; authority, checkpoints and publication unchanged; restored authority resumes the same review');
 console.info(`PROBE IMP-016 3: completed native source-ID mapping -> ${historical.length} inactive historical people with no sessions; exact active identity set unchanged; equal source name did not match; email and name target shortcuts refused`);
 console.info(`PROBE IMP-016 5: retained warning and page readback -> ${sourceRestricted.length} restricted pages, exact reviewed edit and importing-member recovery grants`);
 console.info(`PROBE IMP-016 6: native and published page routes -> anonymous refused for all ${pages.length} imported pages; exposure inventory empty before and after replay`);
}
