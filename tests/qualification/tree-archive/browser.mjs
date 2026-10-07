import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
const checks=[],http=[];let runtime,browser,page;
try {
 runtime=await createRuntime({root:process.cwd(),evidence:process.env.QUAL_EVIDENCE,appPort:8748,inspectorPort:8749});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 ({page}=await fixtureFirstOwner(runtime,context));
 const read=async path=>{const response=await context.request.get(runtime.origin+path);assert.equal(response.status(),200);return response.json();};
 const post=async(path,data,status=200)=>{const response=await context.request.post(runtime.origin+path,{data});const body=await response.json();http.push({path,status:response.status(),body});assert.equal(response.status(),status,JSON.stringify(body));return body;};
 const source=(await read('/api/pages')).items[0].containerId;
 const destination=(await post('/api/containers',{operationKey:randomUUID(),name:'Archive move destination',visibility:'open'})).value.id;
 const create=async(title,parentPageId)=>(await post('/api/pages',{operationKey:randomUUID(),containerId:source,title,parentPageId})).value.pageId;
 const snapshot=async(ids,label)=>{
  const values=ids.map(id=>`'${id}'`).join(',');
  const queries=[`SELECT * FROM pages WHERE id IN (${values}) ORDER BY id`,...['page_revisions','page_blocks','content_events','content_archive_locations'].map(table=>`SELECT * FROM ${table} WHERE page_id IN (${values}) ORDER BY page_id`),`SELECT * FROM operation_receipts WHERE target_id IN (${values}) ORDER BY id`,`SELECT * FROM activity_entries WHERE target_id IN (${values}) ORDER BY id`];
  const result=(await runtime.sql(queries.join(';')+';')).map(q=>q.results.map(row=>JSON.stringify(row)).sort());
  await writeFile(runtime.directory+'/'+label+'.json',JSON.stringify(result,null,2));return result;
 };
 for(const target of ['root','child']){
  const root=await create('Archive '+target+' root'),child=await create('Archive '+target+' child',root),archivedId=target==='root'?root:child;
  const placement={containerId:destination,atEnd:true};
  const reviewed=await post(`/api/pages/${root}/move-preview`,placement);
  const rootBefore=await read('/api/pages/'+root),beforeArchive=await read('/api/pages/'+archivedId);
  await post('/api/archive/'+archivedId,{action:'archive',operationKey:randomUUID(),expectedRevisionId:beforeArchive.page.revisionId});
  const archived=await read('/api/pages/'+archivedId);assert.equal(archived.permissions.canEdit,false);assert.equal(archived.page.revisionId,beforeArchive.page.revisionId);
  await page.goto(runtime.origin+'/app/pages/'+archivedId);await page.getByText('You have read access to this page.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('heading',{name:'Page options',exact:true}).waitFor();await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('button',{name:'Move page',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:`Move ${archived.page.title} in tree`,exact:true}).count(),0);
  await page.screenshot({path:runtime.directory+'/'+target+'-read-only.png',fullPage:true});
  checks.push({clauses:['ARCH-002'],name:target+' archive is read-only in the native page and absent from tree Move controls',passed:true});
  const before=await snapshot([root,child],target+'-before-refusal');assert.equal(before[1].length,2);assert.equal(before[3].map(row=>JSON.parse(row)).filter(row=>row.kind==='moved').length,0);
  await post(`/api/pages/${root}/move-preview`,placement,409);
  await post(`/api/pages/${root}/move`,{...placement,...reviewed,operationKey:randomUUID(),expectedRevisionId:rootBefore.page.revisionId},409);
  const after=await snapshot([root,child],target+'-after-refusal');assert.deepEqual(after,before);
  for(const id of [root,child])assert.equal((await read('/api/pages/'+id)).page.containerId,source);
  checks.push({clauses:['ARCH-002','ARCH-003'],name:target+' archive HTTP 200 then preview/old-revision confirmation 409; rows, histories, events, receipts and activity unchanged',passed:true});
  await post('/api/archive/'+archivedId,{action:'restore',operationKey:randomUUID(),expectedRevisionId:archived.page.revisionId});
  const fresh=await post(`/api/pages/${root}/move-preview`,placement);
  const moved=await post(`/api/pages/${root}/move`,{...placement,...fresh,operationKey:randomUUID(),expectedRevisionId:(await read('/api/pages/'+root)).page.revisionId});
  for(const id of [root,child]){const document=await read('/api/pages/'+id);assert.equal(document.page.containerId,destination);assert.equal(document.permissions.canEdit,true);}
  assert.notEqual(moved.value.revisionId,rootBefore.page.revisionId);
  const movedState=await snapshot([root,child],target+'-restored-moved');assert.equal(movedState[1].length,4);assert.equal(movedState[3].map(row=>JSON.parse(row)).filter(row=>row.kind==='moved').length,2);
  await page.goto(runtime.origin+'/app/pages/'+root);await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'Move page',exact:true}).waitFor();await page.waitForLoadState('networkidle');
  await page.screenshot({path:runtime.directory+'/'+target+'-restored-moved.png',fullPage:true});
  checks.push({clauses:['ARCH-003','TREE-002'],name:target+' restore then reviewed cross-container move succeeds and native edit/Move controls return',passed:true});
 }
 await writeFile(runtime.directory+'/tree-archive.json',JSON.stringify({checks,http,artifact:runtime.artifact,limits:'Local emitted Worker and cached Chromium only. Identity fixture substitutes mailbox possession. Local D1 probes stop/restart Worker; canonical mutations use HTTP. No provider/deployment claim.'},null,2));console.log(runtime.directory);
}catch(error){if(runtime){await writeFile(runtime.directory+'/failure.json',JSON.stringify({checks,http,error:error.stack},null,2));await page?.screenshot({path:runtime.directory+'/failure.png',fullPage:true}).catch(()=>{});console.error(runtime.directory);}throw error;}
finally{await browser?.close();await runtime?.close();}
