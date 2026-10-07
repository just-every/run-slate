import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
const evidence=process.env.QUAL_EVIDENCE;if(!evidence)throw Error('QUAL_EVIDENCE required');let runtime,browser;
const receipts=[];let seq=0;const key=()=>`policy-emitted-${++seq}`;
try{
 runtime=await createRuntime({root:process.cwd(),evidence,appPort:8748,inspectorPort:8749});browser=await chromium.launch({headless:true});const context=await browser.newContext();const owner=await fixtureFirstOwner(runtime,context);
 const api=async(method,path,data,expected=200)=>{const response=await context.request.fetch(runtime.origin+path,{method,data,headers:{Origin:runtime.origin}});const value=await response.json();assert.equal(response.status(),expected,JSON.stringify({path,value}));return value;};
 const policies=(await api('GET','/api/workspace')).policies;const change=async(overrides)=>{const w=await api('GET','/api/workspace');const {id,revisionId,...fields}=w;return api('PUT','/api/workspace',{...fields,operationKey:key(),expectedRevisionId:revisionId,policies:{...w.policies,...overrides}});};
 const container=(await api('GET','/api/containers')).items.find(c=>c.visibility!=='personal');
 const page=await api('POST','/api/pages',{operationKey:key(),containerId:container.id,title:'Emitted retained page'});const id=page.value.pageId;
 const combinations=[{'page.lifecycle.v1':'draft-then-publish','page.version.v1':'labelled','page.access.v1':'container-general','page.public-access.v1':'link','page.status.v1':'open-vocabulary','container.access.v1':'grant-led','record.page-parity.v1':'record-is-row','automation.scope.v1':'container'},{'automation.scope.v1':'site'},policies];
 const immutable=await api('GET',`/api/revisions/${id}/${page.receipt.revisionId}`);
 for(const profile of combinations){await change(profile);const reloaded=await api('GET','/api/workspace');for(const [key,value]of Object.entries(profile))assert.equal(reloaded.policies[key],value);const doc=await api('GET',`/api/pages/${id}`);assert.equal(doc.page.lifecycle,'live');assert.deepEqual((await api('GET',`/api/revisions/${id}/${page.receipt.revisionId}`)).properties,immutable.properties);receipts.push({clauses:['LIFE-006','SHARE-005','WEB-007','REV-007','STAT-005','CONT-008','DB-010','AUTO-005'],profile,assertions:['persisted settings reload','existing lifecycle retained','immutable revision properties unchanged']});}
 await change({'page.lifecycle.v1':'draft-then-publish','page.version.v1':'labelled'});
 const draft=await api('POST','/api/pages',{operationKey:key(),containerId:container.id,title:'Private emitted draft'});assert.equal((await api('GET',`/api/pages/${draft.value.pageId}`)).page.lifecycle,'draft');
 const live=await api('POST',`/api/pages/${draft.value.pageId}/publish`,{operationKey:key(),expectedRevisionId:draft.receipt.revisionId,label:'Emitted qualification'});assert.equal((await api('GET',`/api/pages/${draft.value.pageId}`)).page.lifecycle,'live');assert.equal((await api('GET',`/api/revisions/${draft.value.pageId}`)).items[0].ordinal,1);
 const changed=await api('PATCH',`/api/pages/${draft.value.pageId}`,{operationKey:key(),expectedRevisionId:live.receipt.revisionId,properties:{title:'Unpublished emitted title'}});assert.equal((await api('GET',`/api/pages/${draft.value.pageId}`)).page.lifecycle,'live-with-unpublished-changes');
 const exposure={operationKey:key(),expectedRevisionId:changed.receipt.revisionId,host:new URL(runtime.origin).host,slug:'policy-emitted',theme:'dark',indexable:false};await api('POST',`/api/publishing/${draft.value.pageId}`,exposure);const anonymous=await fetch(runtime.origin+'/p/policy-emitted');assert.equal(anonymous.status,200);const html=await anonymous.text();assert.match(html,/Private emitted draft/);assert.doesNotMatch(html,/Unpublished emitted title/);assert.equal(anonymous.headers.get('set-cookie'),null);
 await api('POST',`/api/publishing/${draft.value.pageId}`,{...exposure,operationKey:key(),revoke:true});assert.equal((await fetch(runtime.origin+'/p/policy-emitted')).status,404);
 receipts.push({clauses:['LIFE-001','LIFE-003','LIFE-005','REV-007','WEB-001','WEB-002','WEB-003','WEB-005','WEB-006'],assertions:['draft to publish to unpublished change via emitted API','ordinal label stored','anonymous renders published snapshot only','no cookie','unpublish resolves 404']});
 await writeFile(runtime.directory+'/policies.json',JSON.stringify({passed:true,artifact:runtime.artifact,receipts,limits:[owner.limits,'Browser here performs genuine setup; profile controls/rendering are independently owned by UI qualification. No provider or human acceptance.']},null,2));console.log(runtime.directory);
}catch(error){if(runtime)await writeFile(runtime.directory+'/policy-failure.txt',error.stack);throw error;}finally{await browser?.close();await runtime?.close();}
