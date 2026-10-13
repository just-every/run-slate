import { signInBrowser } from '../../e2e/outbox-auth.mjs';
import {recordCandidates} from './candidates.mjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {root,evidence,origins,environment,inferenceBoundary,command,start,stop,close,prepareH2h} from './runtime.mjs';
let browser;const errors=[],checks=[];const setupToken=randomBytes(32).toString('hex'),sessionSecret=randomBytes(32).toString('hex'),connectorKey=randomBytes(32).toString('hex');
const checked=async(response,status=200)=>{assert.equal(response.status(),status,await response.text());return response.json();};
try{
 await recordCandidates(root,evidence);
 await prepareH2h(setupToken);
 const orbit=path.resolve(root,'../orbit'),orbitState=path.join(evidence,'orbit-state'),sessionFile=path.join(evidence,'orbit-session.private.json');
 await command(orbit,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','wrangler.toml','--persist-to',orbitState]);
 await command(orbit,['--import',path.join(root,'node_modules/tsx/dist/loader.mjs'),path.join(root,'tests/flagship/cross/orbit-bootstrap.mts')],{...environment,ORBIT_TEST_STATE:orbitState,CROSS_SESSION_FILE:sessionFile});
 const orbitSession=JSON.parse(await readFile(sessionFile,'utf8'));await rm(sessionFile);
 await start(orbit,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config','dist/server/wrangler.json','--persist-to',orbitState,'--port','8762','--inspector-port','8763'],'orbit-runtime',origins.orbit);
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const bootstrap=await checked(await context.request.post(origins.happytohelp+'/api/identity/bootstrap',{data:{name:'Cross edition qualification',ownerName:'Source owner',email:'owner@cross.test',password:randomBytes(24).toString('hex'),allowedOrigin:origins.happytohelp,setupToken}}),201),projectId=bootstrap.projectId;
 const article=await checked(await context.request.post(origins.happytohelp+`/api/knowledge/${projectId}/articles`,{data:{title:'SSO procedure',content:'Retained original guidance',summary:'Original',status:'draft'}}),201),articleTarget=`projects/${projectId}/articles/${article.id}`;
 // A native session is minted by Orbit's production AuthService against isolated D1 before the Worker starts.
 const orbitCookie='__Host-orbit_session='+orbitSession.token;
 await context.addCookies([{name:'__Host-orbit_session',value:orbitSession.token,url:origins.orbit.replace('http:','https:'),secure:true,httpOnly:true,sameSite:'Lax'}]);
 const inventory=await checked(await context.request.get(origins.orbit+'/api/v1/workbench',{headers:{Cookie:orbitCookie}}));
 const opportunity=await checked(await context.request.post(origins.orbit+'/api/v1/workbench/opportunities',{headers:{Origin:origins.orbit,Cookie:orbitCookie},data:{title:'Cross edition onboarding',companyName:'Cross company',contactName:'Case owner',email:'case@cross.test',stageId:inventory.stages[0].id,valueCents:0}}),201),opportunityTarget='opportunities/'+opportunity.id;
 const slateState=path.join(evidence,'slate-state');
 const slateArgs=['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','8764','--strictPort'],slateEnvironment={...environment,SLATE_PERSIST_STATE_PATH:slateState,SLATE_INSPECTOR_PORT:'8765',SLATE_SESSION_SECRET:sessionSecret,SLATE_CONNECTOR_CREDENTIALS_KEY:connectorKey,SLATE_APP_URL:origins.slate,SLATE_HAPPYTOHELP_DELEGATION_ORIGIN:origins.happytohelp,SLATE_HAPPYTOHELP_DELEGATION_CLIENT_ID:'slate-cross',SLATE_HAPPYTOHELP_DELEGATION_ACCOUNT_ID:projectId,SLATE_ORBIT_DELEGATION_ORIGIN:origins.orbit,SLATE_ORBIT_DELEGATION_CLIENT_ID:'slate-cross',SLATE_ORBIT_DELEGATION_ACCOUNT_ID:'workspace',SLATE_ALLOW_LOOPBACK_DELEGATION:'true'};
 let slateChild=await start(root,slateArgs,'slate-runtime',origins.slate,slateEnvironment);
 await page.goto(origins.happytohelp+'/delegation/settings?account_id='+projectId);await page.getByLabel('Client identifier').fill('slate-cross');await page.getByLabel('Slate origin').fill(origins.slate);await page.getByLabel('Exact callback URL').fill(origins.slate+'/api/connectors/oauth/happytohelp/callback');await page.getByLabel('Allow loopback development').check();await page.getByRole('button',{name:'Register client'}).click();await page.getByText('slate-cross —',{exact:false}).waitFor();
 await page.goto(origins.orbit+'/delegation/settings');await page.getByLabel('Client identifier').fill('slate-cross');await page.getByLabel('Exact callback URL').fill(origins.slate+'/api/connectors/oauth/orbit/callback');await page.getByLabel('Allow local loopback callback').check();await page.getByRole('button',{name:'Register application'}).click();await page.getByText('slate-cross —',{exact:false}).waitFor();
 await signInBrowser(page, origins.slate, process.env.SLATE_BROWSER_EMAIL ?? 'jamie@aurora.example');
 await page.getByLabel('Workspace name',{exact:true}).fill('Delegation qualification');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByPlaceholder('Customer Success').fill('Cross edition');await page.getByLabel('First page title').fill('Approved internal correction');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Skip this step'}).click();await page.waitForURL('**/app/pages/*');
 const pageId=page.url().split('/').at(-1),document=await checked(await context.request.get(origins.slate+'/api/pages/'+pageId)),member=await checked(await context.request.get(origins.slate+'/api/members/current'));
 for(const [provider,target] of [['happytohelp',articleTarget],['orbit',opportunityTarget]]){
  await page.goto(origins.slate+'/app/settings?section=connections');await page.getByLabel('Source link').fill(origins[provider]+'/'+target);await page.getByRole('button',{name:'Add source',exact:true}).click();await page.waitForURL(origins[provider]+'/delegation/authorize?**');await page.getByRole('button',{name:'Allow selected access',exact:true}).waitFor();
  // Publication is independently optional; this journey authorizes draft correction only.
  if(provider==='happytohelp'){const publication=page.locator('input[type="checkbox"][value="knowledge.article.publish"]');if(await publication.count())await publication.uncheck();}
  await page.screenshot({path:path.join(evidence,provider+'-consent.png'),fullPage:true});await page.getByRole('button',{name:'Allow selected access',exact:true}).click();await page.waitForURL(origins.slate+'/app/settings?connected='+provider);checks.push(provider+' native browser consent and Slate PKCE callback');
 }
 const connections=await checked(await context.request.get(origins.slate+'/api/connectors'));assert.equal(connections.items.filter(x=>x.state==='connected').length,2);
 // Test-only deterministic procedure fixture. No model output or external exposure is fabricated.
 const runId='cross-procedure',now=new Date().toISOString(),quote=v=>"'"+String(v).replaceAll("'","''")+"'",refs=JSON.stringify([{kind:'page',sourceId:pageId,revisionId:document.workingRevisionId}]);
 const sql=`UPDATE workspaces SET ai_enabled=1; INSERT INTO intelligence_runs(id,workspace_id,requester_id,page_id,kind,status,stage,revision_id,input_json,refs_json,audience_json,provider,model,route_reason,reserved_micros,created_at,updated_at) SELECT ${quote(runId)},workspace_id,id,${quote(pageId)},'procedure','needs-review','review','cross-run-revision',${quote(JSON.stringify({question:'Apply the reviewed internal correction and onboarding handoff',kind:'procedure'}))},${quote(refs)},${quote(JSON.stringify([member.id]))},'deterministic','none','deterministic-native-protocol-test',0,${quote(now)},${quote(now)} FROM members WHERE id=${quote(member.id)};`;
 // Transfer local SQLite ownership only after the entire dev process group exits.
 await stop(slateChild);
 await command(root,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','wrangler.jsonc','--persist-to',slateState,'--command',sql,'--json']);
 slateChild=await start(root,slateArgs,'slate-runtime-after-fixture',origins.slate,slateEnvironment);
 await writeFile(path.join(evidence,'setup.json'),JSON.stringify({origins,projectId,articleId:article.id,opportunityId:opportunity.id,pageId,runId,memberId:member.id,connections:connections.items.map(({id,provider})=>({id,provider})),checks},null,2));
 const {exerciseEffects}=await import('./effects.mjs');await exerciseEffects({page,context,evidence,origins,runId,articleTarget,opportunityTarget,projectId,articleId:article.id,opportunityId:opportunity.id,connections,checks,beforeRevocation:async receipts=>{const {proveRestore}=await import("./restore.mjs");await proveRestore({browser,context,evidence,origins,checks,receipts,pageId});}});
 assert.deepEqual(errors,[]);await writeFile(path.join(evidence,'result.json'),JSON.stringify({checks,errors,inferenceBoundary,limits:'Real local native delegation and browser UI. Deterministic procedure fixture; no hosted or prospective inquiry claim.'},null,2));console.log('Cross evidence: '+evidence);
}catch(error){if(browser){for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:path.join(evidence,'failure-'+Date.now()+'.png'),fullPage:true}).catch(()=>{});}throw error;}finally{await browser?.close();await close();}
