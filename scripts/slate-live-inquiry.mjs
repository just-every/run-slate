import { signInBrowser } from '../tests/e2e/outbox-auth.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const origin=process.env.SLATE_BROWSER_ORIGIN??'http://127.0.0.1:8740',output='.artifacts/browser';
if(process.env.SLATE_AUTHORIZE_PRODUCT_INFERENCE!=='yes')throw Error('This probe invokes product inference and may incur usage or charges. Explicit authorization is required.');
const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await signInBrowser(page, origin, process.env.SLATE_BROWSER_EMAIL ?? 'jamie@aurora.example');
 const pages=await(await context.request.get(origin+'/api/pages')).json();const id=pages.items[0].id;
 await page.goto(origin+'/app/pages/'+id);await page.getByRole('button',{name:'Ask',exact:true}).click();
 const availability=await(await context.request.get(origin+'/api/ai/availability')).json();if(!availability.modelPolicyConfigured||availability.perRunTokenAllowance<150000){if(availability.modelPolicyConfigured)await page.getByText('AI allowance',{exact:true}).click();await page.getByLabel('Monthly token allowance').fill('1000000');await page.getByLabel('Token allowance for one run').fill('150000');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Set allowance',exact:true}).click();await page.getByRole('heading',{name:'Local inference allowance',exact:true}).waitFor();}
 await page.getByLabel('Your question').fill('What evidence is available on this page, and what is missing before we can confirm launch readiness? Do not invent decisions.');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/ai/ask')&&r.request().method()==='POST');await page.getByRole('button',{name:'Ask Slate',exact:true}).click();const started=await response;assert.equal(started.status(),200,await started.text());const runId=(await started.json()).value.id;
 let run;for(let i=0;i<100;i++){run=await(await context.request.get(origin+'/api/runs/'+runId)).json();if(['completed','failed','needs-review'].includes(run.status))break;await new Promise(r=>setTimeout(r,2000));}
 assert.ok(['completed','needs-review'].includes(run.status),JSON.stringify(run));assert.ok(run.output.answer.statements.length);assert.equal(run.completedEffects.length,0);await page.goto(origin+'/app/runs/'+runId);await page.getByText(run.status.replaceAll('-',' '),{exact:true}).first().waitFor({timeout:10000});await page.waitForLoadState('networkidle');await page.screenshot({path:output+'/live-answer-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/live-answer-narrow.png',fullPage:true});assert.deepEqual(errors,[]);await writeFile(output+'/live-answer.json',JSON.stringify({run,errors,interceptedApi:false,provider:'local-codex',limits:'Local inference only, no hosted provider acceptance'},null,2));
}finally{await browser.close();}
