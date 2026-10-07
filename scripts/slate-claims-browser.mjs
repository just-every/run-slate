import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const evidence=process.env.SLATE_BROWSER_EVIDENCE??'.artifacts/browser';
const origin=process.env.SLATE_BROWSER_ORIGIN??'http://127.0.0.1:8740';
const prior=JSON.parse(await readFile(evidence+'/live-answer.json','utf8'));
const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/signin');await page.getByTestId('local-sign-in').click();await page.waitForURL('**/app');
 await page.goto(origin+'/app/runs/'+prior.run.id);
 const capture=page.locator('details').filter({has:page.getByText('Retain a scoped claim',{exact:true})}).first();
 await capture.getByText('Retain a scoped claim',{exact:true}).click();
 const retained=await context.request.get(origin+'/api/claims/runs/'+prior.run.id);assert.equal(retained.status(),200);
 let claims=(await retained.json()).items;
 if(!claims.length){await capture.getByRole('button',{name:'Retain exact evidence'}).click();await capture.getByText(/Claim retained · unverified/).waitFor();claims=(await (await context.request.get(origin+'/api/claims/runs/'+prior.run.id)).json()).items;}
 const claim=claims.filter(item=>item.statementIndex===0).at(-1),suffix=String(Date.now());
 // This fixture is an explicitly local human decision, never an external commercial entitlement.
 const existing=(await (await context.request.get(origin+'/api/decisions?pageId='+claim.pageId)).json()).items[0];
 let decision,accepted;
 if(existing){assert.match(existing.question,/Local qualification:/);assert.equal(existing.state,'accepted');decision={id:existing.id};accepted={revisionId:existing.revision_id};}
 else{
 const decisionResponse=await context.request.post(origin+'/api/decisions',{headers:{Origin:origin},data:{operationKey:'claim-browser-decision-'+suffix,pageId:claim.pageId,question:'Local qualification: retain scoped internal evidence?',options:['Retain','Defer'],outcome:'Retain',rationale:'Local browser fixture only; no external account, activation or purchase authority.',ownerId:claim.ownerId,decidedAt:null,reviewAt:null,citations:claim.passages.map(p=>p.ref)}});
 assert.equal(decisionResponse.status(),200,await decisionResponse.text());decision=(await decisionResponse.json()).value;
 const acceptResponse=await context.request.post(origin+'/api/decisions/'+decision.id+'/accept',{headers:{Origin:origin},data:{operationKey:'claim-browser-accept-'+suffix,expectedRevisionId:decision.revisionId}});assert.equal(acceptResponse.status(),200,await acceptResponse.text());accepted=(await acceptResponse.json()).value;
 }
 await capture.getByText(/Claim retained · unverified/).waitFor();
 const scope=capture.locator('details').filter({has:page.getByText('Scope, conflict and unknown state',{exact:true})}).first();
 await scope.getByText('Scope, conflict and unknown state',{exact:true}).click();
 await capture.getByRole('button',{name:'Refresh accepted decisions'}).click();
 await capture.getByLabel('Account',{exact:true}).fill('Local qualification account');
 await capture.getByLabel('Accepted decision',{exact:true}).selectOption(JSON.stringify([decision.id,accepted.revisionId]));
 await capture.getByLabel('Authority applies to',{exact:true}).fill('Internal evidence retention for this local qualification account only.');
 const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/revise')),reloaded=page.waitForResponse(r=>r.request().method()==='GET'&&/\/api\/claims\/[^/]+$/.test(new URL(r.url()).pathname));
 await capture.getByRole('button',{name:'Save scoped revision'}).click();const savedResponse=await saved;assert.equal(savedResponse.status(),200);await reloaded;
 await capture.getByRole('button',{name:'Save scoped revision',includeHidden:true}).waitFor({state:'attached'});
 await capture.getByText(/current accepted decision reference/).waitFor();
 // Mutation remounts the details, so reopen the actual saved form before visual checks.
 if(!await scope.evaluate(element=>element.open))await scope.getByText('Scope, conflict and unknown state',{exact:true}).click();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:evidence+'/claim-desktop.png',fullPage:true});
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:evidence+'/claim-'+width+'.png',fullPage:true});}
 await page.reload();await capture.getByText('Retain a scoped claim',{exact:true}).click();await capture.getByText(/current accepted decision reference/).waitFor();await scope.getByText('Scope, conflict and unknown state',{exact:true}).click();
 assert.equal(await capture.getByLabel('Account',{exact:true}).inputValue(),'Local qualification account');assert.equal(await capture.getByLabel('Accepted decision',{exact:true}).inputValue(),JSON.stringify([decision.id,accepted.revisionId]));assert.deepEqual(errors,[]);
 await writeFile(evidence+'/claim-result.json',JSON.stringify({runId:prior.run.id,retainedAfterReload:true,exactDecisionId:decision.id,exactDecisionRevision:accepted.revisionId,authorityFixture:'local internal evidence retention only',errors,newInferenceCalls:0,widths:[320,390,430]},null,2));
}finally{await browser.close();}
