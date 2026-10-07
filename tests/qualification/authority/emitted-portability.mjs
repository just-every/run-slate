import assert from 'node:assert/strict';
import {assertArchiveEquivalent} from './archive-equivalence.mjs';
import {randomBytes,createHmac,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {chromium} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {command,safeEnvironment} from '../local/process.mjs';
const root=process.cwd(),evidence=process.env.QUAL_EVIDENCE;
if(!evidence)throw Error('QUAL_EVIDENCE required');
let runtime,browser,importedWordPageId;const checks=[];
const unpack=bytes=>JSON.parse(new TextDecoder().decode(unzipSync(bytes)['manifest.json']));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function signIn(context,create=false){
 const token=randomBytes(32).toString('base64url'),digest=createHmac('sha256',runtime.sessionSecret).update(token).digest('hex'),now=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();
 if(create)await runtime.sql(`INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('empty-recovery','Recovery','', '${now}','${now}','recovery'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('recovery-owner','empty-recovery','qualification-owner@test.invalid','Recovery owner','RO','owner','member','active',1,'${now}','${now}');`);
 await runtime.sql(`INSERT INTO magic_links(id,email,token_digest,expires_at,created_at) VALUES('${randomBytes(8).toString('hex')}','qualification-owner@test.invalid','${digest}','${expires}','${now}');`);
 const page=await context.newPage();await page.goto(runtime.origin+'/api/auth/magic/accept?token='+token);return page;
}
async function cookie(context){return (await context.cookies()).map(c=>c.name+'='+c.value).join('; ');}
try{
 runtime=await createRuntime({root,evidence,appPort:8740,inspectorPort:8741});browser=await chromium.launch({headless:true});const context=await browser.newContext(),owner=await fixtureFirstOwner(runtime,context),page=owner.page;
 await page.goto(runtime.origin+'/app/settings');await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Import & export',exact:true}).click();await page.screenshot({path:path.join(evidence,'import-panel.png'),fullPage:true});await writeFile(path.join(evidence,'import-panel.html'),await page.content());
 for(const [format,file,relative]of [['notion-workspace','notion-workspace-export.zip','tests/e2e/imports/fixtures/real'],['confluence-space','confluence-space-export.zip','tests/e2e/imports/fixtures/real'],['docx','word-government-impact-assessment.docx','tests/flagship/federation/fixtures'],['google-docx','google-docs-download.docx','tests/e2e/imports/fixtures/real']]){
  await page.locator('select[name="format"]').selectOption(format);await page.locator('input[type="file"]').first().setInputFiles(path.join(root,relative,file));
  const completed=page.waitForResponse(r=>r.url().includes('/api/imports/')&&r.url().endsWith('/run')&&r.request().method()==='POST');await page.getByRole('button',{name:'Import',exact:true}).click();const response=await completed;assert.equal(response.status(),200,await response.text());const job=await response.json();assert.equal(job.state,'completed');assert.ok(job.counts.pages>0);
  await page.getByRole('heading',{name:'Import · completed',exact:true}).waitFor();const original=await context.request.get(runtime.origin+'/api/imports/'+job.id+'/original');assert.equal(hash(await original.body()),hash(await readFile(path.join(root,relative,file))));
  const rows=await runtime.sql(`SELECT p.id,p.title FROM pages p WHERE p.id IN (SELECT target_id FROM federation_import_mappings WHERE import_job_id='${job.id}' AND source_kind='page');`);assert.ok(rows[0].results.length>0);if(format==='docx')importedWordPageId=rows[0].results[0].id;
  const found=new Set();let cursor;do{const result=await context.request.get(runtime.origin+'/api/search?'+new URLSearchParams({query:'',limit:'100',...(cursor?{cursor}:{})}));assert.equal(result.status(),200,await result.text());const data=await result.json();for(const item of data.items)found.add(item.pageId);cursor=data.nextCursor;}while(cursor);for(const row of rows[0].results)assert.ok(found.has(row.id),'Imported page searchable immediately: '+row.title);
  checks.push({clause:format==='notion-workspace'?'IMP-002':'IMP-003',format,id:job.id,counts:job.counts,sourceHash:hash(await original.body())});
  await page.screenshot({path:path.join(evidence,format+'.png'),fullPage:true});
 }
 const [pages]=await runtime.sql('SELECT id,working_revision_id FROM pages ORDER BY created_at LIMIT 1'),host=pages.results[0],def={instructions:'Test-only recovery authority fixture',refs:[{kind:'page',sourceId:host.id,revisionId:host.working_revision_id}],audience:[owner.memberId],tools:['read-evidence'],effects:[],preconditions:[],successTests:['Retain history and require fresh owner activation'],escalations:[],maxCostMicros:1};
 const request=(url,data)=>context.request.post(runtime.origin+url,{headers:{Origin:runtime.origin},data});
 let response=await request('/api/skills',{operationKey:crypto.randomUUID(),pageId:host.id,name:'Recovery fixture',definition:def});assert.equal(response.status(),200,await response.text());const skill=(await response.json()).value;
 // Only lifecycle input is a labelled test evaluation. This does not claim measured skill quality.
 await runtime.sql(`INSERT INTO intelligence_evaluations(id,workspace_id,skill_revision_id,case_hash,result_json,passed,created_at) VALUES('labelled-recovery-test-evaluation','${owner.workspaceId}','${skill.revisionId}','labelled-test','{}',1,'${new Date().toISOString()}'); UPDATE intelligence_skill_versions SET state='evaluated',evaluation_id='labelled-recovery-test-evaluation' WHERE id='${skill.revisionId}';`);
 response=await request('/api/skills/'+skill.revisionId+'/transition',{operationKey:crypto.randomUUID(),action:'activate'});assert.equal(response.status(),200,await response.text());
 // Persist real pending publication choices; recovery must retain them without firing the schedule.
 response=await context.request.get(runtime.origin+'/api/pages/'+importedWordPageId);assert.equal(response.status(),200,await response.text());const word=await response.json();
 const publicationChoices={destination:{containerId:word.page.containerId,parentPageId:word.parentPageId,treePosition:'0090'},generalAccess:{kind:'restricted'},publishAsMemberId:owner.memberId};
 const publicationInput={expectedRevisionId:word.page.revisionId,publishAt:new Date(Date.now()+3600000).toISOString(),label:'Local recovery schedule',...publicationChoices};
 response=await request('/api/pages/'+importedWordPageId+'/publish-preview',publicationInput);assert.equal(response.status(),200,await response.text());const preview=await response.json();assert.ok(preview.previewFingerprint);
 // Match the server release review: omit the staging revision and retain only release readers.
 const {previewFingerprint,expectedRevisionId,...review}=preview;
 const releaseReview={...review,audience:review.audience.map(p=>({pageId:p.pageId,readers:p.readers.filter(r=>r.after).map(({before,...reader})=>reader)}))};
 assert.equal(expectedRevisionId,publicationInput.expectedRevisionId);assert.equal(releaseReview.pageId,importedWordPageId);assert.ok(releaseReview.content.blocks.length>0);
 const retainedPublication={...publicationChoices,review:releaseReview};
 response=await request('/api/pages/'+importedWordPageId+'/publish',{operationKey:crypto.randomUUID(),...publicationInput,previewFingerprint});assert.equal(response.status(),200,await response.text());assert.equal((await response.json()).value.scheduled,true);
 const archiveFile=path.join(evidence,'workspace.zip');await command('pnpm',['run','export',archiveFile],{cwd:root,env:{...safeEnvironment(),SLATE_APP_URL:runtime.origin,SLATE_SESSION_COOKIE:await cookie(context)},log:path.join(evidence,'export-command.log')});
 const bytes=await readFile(archiveFile),before=unpack(bytes);assert.equal(before.tables.intelligence_skill_versions[0].state,'active');assert.equal(before.tables.federation_imports.filter(j=>j.state==='completed').length,4);assert.equal(before.tables.content_schedules[0].state,'scheduled');assert.deepEqual(JSON.parse(before.tables.content_schedules[0].publication_json),retainedPublication);await context.close();await runtime.close();
 runtime=await createRuntime({root,evidence,appPort:8740,inspectorPort:8741});const restored=await browser.newContext();await signIn(restored,true);
 await command('pnpm',['run','import',archiveFile],{cwd:root,env:{...safeEnvironment(),SLATE_APP_URL:runtime.origin,SLATE_SESSION_COOKIE:await cookie(restored)},log:path.join(evidence,'import-command.log')});
 const restoredPage=await signIn(restored);
 const [derived]=await runtime.sql('SELECT COUNT(DISTINCT page_id) AS indexed FROM search_text WHERE page_id IS NOT NULL; SELECT COUNT(*) AS pending FROM search_dirty');assert.equal(derived.results[0].indexed,before.tables.pages.filter(p=>!p.deleted_at).length);
 const [dirty]=await runtime.sql('SELECT COUNT(*) AS pending FROM search_dirty');assert.equal(dirty.results[0].pending,0);
 const [authority]=await runtime.sql(`SELECT state,authority_id,evaluation_id FROM intelligence_skill_versions WHERE id='${skill.revisionId}'`);assert.equal(authority.results[0].state,'evaluated');assert.equal(authority.results[0].authority_id,null);assert.equal(authority.results[0].evaluation_id,'labelled-recovery-test-evaluation');
 const nextFile=path.join(evidence,'restored-workspace.zip');await command('pnpm',['run','export',nextFile],{cwd:root,env:{...safeEnvironment(),SLATE_APP_URL:runtime.origin,SLATE_SESSION_COOKIE:await cookie(restored)},log:path.join(evidence,'reexport-command.log')});const after=unpack(await readFile(nextFile));
 const tableCounts=assertArchiveEquivalent(before,after,'qualification-owner@test.invalid');
 await writeFile(path.join(evidence,'all-table-equivalence.json'),JSON.stringify(tableCounts,null,2));
 await restoredPage.goto(runtime.origin+'/app/pages/'+importedWordPageId);await restoredPage.getByRole('textbox',{name:'Page title',exact:true}).waitFor();await restoredPage.locator('[data-block-id]').filter({hasText:'Final stage impact assessment'}).first().waitFor();await restoredPage.waitForLoadState('networkidle');await restoredPage.screenshot({path:path.join(evidence,'restored-page.png'),fullPage:false});
 assert.deepEqual(after.blobs.map(b=>b.hash).sort(),before.blobs.map(b=>b.hash).sort());
 assert.equal(after.tables.content_schedules[0].state,'cancelled');assert.deepEqual(JSON.parse(after.tables.content_schedules[0].publication_json),retainedPublication);assert.equal(after.tables.sessions,undefined);assert.ok(after.tables.public_exposures.every(p=>p.revoked_at));assert.ok(after.tables.intelligence_grants.every(g=>g.revoked_at));
 checks.push({clause:'FLAG-004',result:'emitted Worker D1/R2 + actual pnpm run export/import/export retains imported originals, exact page/history/evaluation lineage; restored skill evaluated with authority null'});
 await writeFile(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks,tableCounts,archiveHashes:{before:hash(bytes),after:hash(await readFile(nextFile))},artifactHash:runtime.artifact.artifactHash,limits:'Local emitted Worker and genuine imported Word body rendered after restore. Identity fixture replaces mailbox possession; test-only passing skill evaluation does not prove quality. No inference configured or requested; root must rerun after any later integration.'},null,2));console.log(evidence);
}finally{await browser?.close();await runtime?.close();}
