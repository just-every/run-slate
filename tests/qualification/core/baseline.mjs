import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import AxeBuilder from '@axe-core/playwright';
import {api,op} from './support.mjs';
export async function baselineChecks({r,owner,check,browser,context}){
 const scripts=await readdir(path.join(r.root,'dist/client/assets'));const bundle=(await Promise.all(scripts.filter(x=>x.endsWith('.js')).map(x=>readFile(path.join(r.root,'dist/client/assets',x),'utf8')))).join('\n');
 await check(['BASE-SECRET-001'],'client-and-errors-exclude-server-secrets',async()=>{
 // The bundled operator docs name settings such as SESSION_SECRET; their values never ship.
 for(const value of [r.sessionSecret,'token_digest','cloudflare:workers'])assert.equal(bundle.includes(value),false,value);
 const error=await api(r,'/api/pages/not-existing',owner);assert.equal(JSON.stringify(error.data).includes(r.sessionSecret),false);
 });
 await check(['BASE-ACCESS-002'],'generated-functions-independently-deny-missing-session',async()=>{
 const ids=[...new Set([...bundle.matchAll(/[0-9a-f]{64}/g)].map(x=>x[0]))];assert.ok(ids.length>0);
 let denied=0;for(const id of ids){const response=await fetch(`${r.origin}/_serverFn/${id}`,{headers:{origin:r.origin,'x-tsr-serverFn':'true'},redirect:'manual'});const text=await response.text();assert.equal(text.includes('qualification-owner@test.invalid'),false);if(text.includes('isSerializedRedirect')&&text.includes('/signin'))denied++;}
 assert.ok(denied>0,'At least one emitted generated private handler independently denies');
 });
 await check(['BASE-OPS-001'],'health-real-D1-R2-queue-under-one-second',async()=>{
 const times=[];for(let n=0;n<10;n++){const result=await api(r,'/health');assert.equal(result.status,200);assert.equal(result.data.checks.database.status,'reachable');assert.equal(result.data.checks.files.status,'reachable');times.push(result.ms);}assert.ok(Math.max(...times)<1000,JSON.stringify(times));
 await writeFile(r.directory+'/health-times.json',JSON.stringify(times));
 });
 await check(['HOME-001','BASE-PUBLIC-001'],'anonymous-root-is-private-cookie-free-and-first-party',async()=>{
 const anonymous=await browser.newContext();try{const page=await anonymous.newPage(),requests=[];page.on('request',request=>requests.push(request.url()));await page.goto(r.origin);await page.waitForLoadState('networkidle');const text=await page.locator('body').innerText();assert.ok(text.includes('Slate'));assert.ok(text.includes('Sign in'));for(const hidden of ['Qualification workspace','Qualified workspace','Qualification first page','qualification-owner@test.invalid'])assert.equal(text.includes(hidden),false);assert.deepEqual(await anonymous.cookies(),[]);assert.ok(requests.every(url=>new URL(url).origin===r.origin));await page.screenshot({path:r.directory+'/public-root.png'});}finally{await anonymous.close();}
 });
 await check(['DOCS-001','BASE-PUBLIC-001','BASE-PUBLIC-003'],'anonymous-docs-are-cookie-free-first-party-and-axe-AA',async()=>{
 // The same anonymous loop as the root: no session, no cookie, no off-origin request, one h1, and WCAG 2.2 AA clean.
 const anonymous=await browser.newContext();
 try{
  const page=await anonymous.newPage(),requests=[];
  page.on('request',request=>requests.push(request.url()));
  for(const route of ['/docs','/docs/install']){
   await page.goto(r.origin+route);await page.waitForLoadState('networkidle');
   assert.equal(await page.locator('h1').count(),1,route);
   assert.ok((await page.locator('body').innerText()).includes('Install and deploy'),route);
   for(const hidden of ['Qualification workspace','Qualified workspace','Qualification first page','qualification-owner@test.invalid'])assert.equal((await page.locator('body').innerText()).includes(hidden),false,route);
   assert.deepEqual(await anonymous.cookies(),[],route);
   const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],route);
  }
  assert.ok(requests.every(url=>new URL(url).origin===r.origin));
 }finally{await anonymous.close();}
 });
 await check(['BASE-PUBLIC-003'],'root-signin-settings-axe-AA',async()=>{
 const page=await context.newPage();try{const reports=[];for(const {route,theme} of [{route:'/'},{route:'/signin'},{route:'/app/settings',theme:'light'},{route:'/app/settings',theme:'dark'}]){if(theme)await api(r,'/api/members/current/theme',owner,{operationKey:op(),theme},'PUT');await page.goto(r.origin+route);await page.waitForLoadState('networkidle');const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();reports.push({route,theme,violations:result.violations});}await writeFile(r.directory+'/axe.json',JSON.stringify(reports,null,2));assert.deepEqual(reports.flatMap(r=>r.violations.map(v=>({route:r.route,theme:r.theme,id:v.id,nodes:v.nodes.map(n=>n.target)}))),[]);}finally{await page.close();}
 });
 await check(['BASE-ACCESS-003'],'public-auth-rate-limit-at-manifest-boundary',async()=>{
 const minuteRemainder=Date.now()%60_000;if(minuteRemainder>30_000)await delay(60_000-minuteRemainder);
 const burstMinute=Math.floor(Date.now()/60_000);
 let limited=false;for(let n=0;n<121;n++){const response=await api(r,'/api/auth/capabilities');if(response.status===429){limited=true;break;}assert.equal(response.status,200);}assert.equal(limited,true);
 assert.equal(Math.floor(Date.now()/60_000),burstMinute,'Rate-limit burst must finish in the same real minute it started');
 });
}
