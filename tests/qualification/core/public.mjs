import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {api,pageFixture,q} from './support.mjs';
export async function publicChecks({r,check,browser}){
 await pageFixture(r,'public-qualified',{title:'Public qualification page'});
 await r.sql(`INSERT INTO public_exposures(id,page_id,host,slug,published_at) VALUES('public-qualified-exposure','public-qualified',${q(new URL(r.origin).host)},'qualified-public',${q(new Date().toISOString())});`);
 await check(['BASE-PUBLIC-001','BASE-PUBLIC-002'],'public-page-cookie-free-no-third-party-frame-denial',async()=>{
 const response=await api(r,'/p/qualified-public');assert.equal(response.status,200);assert.equal(response.headers.has('set-cookie'),false);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const context=await browser.newContext();try{const page=await context.newPage(),requests=[];page.on('request',request=>requests.push(request.url()));await page.goto(r.origin+'/p/qualified-public');await page.waitForLoadState('networkidle');assert.equal((await context.cookies()).length,0);assert.ok(requests.every(url=>new URL(url).origin===r.origin));assert.equal((await page.locator('body').innerText()).includes('qualification-owner@test.invalid'),false);await page.screenshot({path:r.directory+'/public-read.png',fullPage:true});}finally{await context.close();}
 });
 await check(['BASE-PUBLIC-003'],'published-read-axe-AA',async()=>{
 const context=await browser.newContext();try{const page=await context.newPage();await page.goto(r.origin+'/p/qualified-public');const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();await writeFile(r.directory+'/public-axe.json',JSON.stringify(report.violations,null,2));assert.deepEqual(report.violations,[]);}finally{await context.close();}
 });
}
