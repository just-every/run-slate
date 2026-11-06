import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {call} from './two-people-support.mjs';
import {accessible} from './browser-evidence.mjs';

/** Real incumbent bytes enter through Settings; all report and page reads are native. */
export async function importReviewJourney(state,width) {
 const {page,context,origin,api}=state;
 await state.switchIdentity('owner');
 const before=(await api('/api/containers')).items.map(item=>item.id).sort();
 await page.goto(origin+'/app/settings/portability',{waitUntil:'networkidle'});
 const bytes=await readFile(new URL('../../e2e/imports/fixtures/real/confluence-space-export.zip',import.meta.url));
 await page.getByLabel('Format',{exact:true}).selectOption('confluence-space');
 await page.getByLabel('File',{exact:true}).setInputFiles({name:'confluence-space-export.zip',mimeType:'application/zip',buffer:bytes});
 const staged=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/imports/stream'&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Upload and review',exact:true}).click();
 const stagedResponse=await staged;assert.equal(stagedResponse.status(),200,await stagedResponse.text());
 const {id}=await stagedResponse.json(),base='/api/imports/'+id,panel=page.locator('.import-review');
 await expect(panel.getByRole('heading',{name:'Import · preview',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Apply reviewed import',exact:true})).toBeEnabled();
 let review=await api(base);
 assert.deepEqual(review.report.mappings,[]);
 assert.deepEqual((await api('/api/containers')).items.map(item=>item.id).sort(),before,'Preview creates no native space.');
 const sourceId='confluence-member:100001:d9d99555-7c2d-5fc9-9d5f-444042ec9317';
 const principal=review.report.principals.find(item=>item.sourceId===sourceId&&item.kind==='member');assert.ok(principal);
 const reader=review.report.candidates.members.find(item=>item.id==='browser-reader');assert.ok(reader);
 const index=review.report.principals.findIndex(item=>item===principal);
 await panel.getByRole('group',{name:'Review access mappings',exact:true}).getByRole('combobox').nth(index).selectOption(reader.id);
 await expect(panel.getByRole('button',{name:'Apply reviewed import',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'Review these mappings',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Apply reviewed import',exact:true})).toBeEnabled();
 review=await api(base);
 assert.deepEqual(review.report.mappings,[{sourceId,kind:'member',targetId:reader.id}]);
 const warnings=panel.locator('details').filter({has:page.locator('summary',{hasText:/^Warnings/})});
 await warnings.locator('summary').click();
 await expect(warnings).toContainText('conservatively close native page inheritance');
 const evidence=process.env.SLATE_IMPORT_EVIDENCE_DIR??'.artifacts/ui-convergence/imports';await mkdir(evidence,{recursive:true});
 await warnings.scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(evidence,`${width}-review.png`),fullPage:false});
 await panel.getByRole('button',{name:'Apply reviewed import',exact:true}).click();
 await expect(panel.getByRole('heading',{name:'Import · completed',exact:true})).toBeVisible({timeout:120000});
 await page.reload({waitUntil:'networkidle'});
 await expect(panel.getByRole('heading',{name:'Import · completed',exact:true})).toBeVisible();
 const completed=await api(base);assert.deepEqual(completed.report.mappings,review.report.mappings);assert.deepEqual(completed.report.access,review.report.access);
 const mappings=panel.locator('details').filter({has:page.locator('summary',{hasText:'Reviewed access mappings'})});
 await mappings.locator('summary').click();
 const mappedRow=mappings.locator('dl > div').filter({has:page.locator('dt small',{hasText:sourceId})});
 await expect(mappedRow.locator('dd')).toContainText(reader.label);
 await expect(mappedRow.locator('dd small')).toHaveText(reader.id);
 for(const person of completed.report.principals.filter(item=>item.sourceId!==sourceId)){
  const row=mappings.locator('dl > div').filter({has:page.locator('dt small',{hasText:person.sourceId})});
  await expect(row.locator('dd')).toHaveText('Inactive historical person');
 }
 await mappedRow.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`${width}-mapped.png`),fullPage:false});
 await mappings.locator('summary').click();
 const access=panel.locator('details').filter({has:page.locator('summary',{hasText:'Restriction and recovery access'})});
 await access.locator('summary').click();
 const fields={restrictedPages:'Restricted pages',mappedLiveGrants:'Mapped live grants',historicalMembers:'Inactive historical members'};
 for(const [key,label] of Object.entries(fields))await expect(access.locator('dl > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd')).toHaveText(completed.report.access[key].toLocaleString('en-US'));
 const completedWarnings=panel.locator('details').filter({has:page.locator('summary',{hasText:/^Warnings/})});await completedWarnings.locator('summary').click();
 await expect(completedWarnings).toContainText('conservatively close native page inheritance');
 await completedWarnings.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`${width}-conversion.png`),fullPage:false});
 await accessible(page,'reviewed Confluence import');
 const creations=[];for(let n=0;n<completed.report.sections.created.pages;n++)creations.push(...(await api(base+`/report/created?page=${n}`)).items);
 const pages=creations.filter(item=>item.kind==='page');assert.equal(pages.length,completed.counts.pages);
 for(const item of pages){const grants=await api('/api/sharing/pages/'+item.targetId);assert.equal(grants.restricted,true);assert.deepEqual(grants.inheritedItems,[]);assert.ok(grants.items.some(grant=>grant.principalId===reader.id&&grant.level==='edit'));}
 const anonymous=await context.browser().newContext();
 try{
  await state.switchIdentity('reader');
  for(const item of pages){const result=await call(context,origin,'GET','/api/pages/'+item.targetId);assert.equal(result.status,200);assert.equal(result.body.page.title,item.label);
   const refused=await anonymous.request.get(origin+'/api/pages/'+item.targetId);assert.equal(refused.status(),401);assert.ok(!(await refused.text()).includes(item.label));
   const published=await anonymous.request.get(origin+'/p/'+item.targetId);assert.equal(published.status(),404);assert.ok(!(await published.text()).includes(item.label));}
 }finally{await anonymous.close();await state.switchIdentity('owner');}
 console.log(`PROBE IMP-016 Settings ${width}: genuine archive upload, explicit mapping, Apply and reload -> completed; reviewed member and historical people displayed; conversion retained; ${pages.length} restricted reader pages and no anonymous page`);
}
