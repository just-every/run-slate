import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/** Browser proof uses only the disposable production application's real doors. */
export async function browserProof({request,origin,cookie}) {
 const directory=await mkdtemp(join(tmpdir(),'slate-agent-proof-'));
 let stage='launch';
 const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies(cookie.split('; ').map(item=>{const i=item.indexOf('=');return {name:item.slice(0,i),value:item.slice(i+1),url:origin};}));
  await context.route('**/*',async route=>{
   const incoming=route.request(),url=new URL(incoming.url());
   if(url.origin!==origin){await route.abort();return;}
   const response=await request(url.href,{method:incoming.method(),headers:await incoming.allHeaders(),...(incoming.postDataBuffer()?{body:incoming.postDataBuffer()}:{}),redirect:'manual'});
   const headers=Object.fromEntries(response.headers);for(const name of ['content-length','content-encoding','transfer-encoding'])delete headers[name];
   await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
  });
  const page=await context.newPage();
  for(const [path,label] of [['/agents','agents'],['/docs/agents','agent-docs'],['/app/settings?section=activity','native-activity']]) {
   stage=path;
   const response=await page.goto(origin+path,{waitUntil:'networkidle'});
   await page.screenshot({path:join(directory,label+'-1440.png'),fullPage:false});
   assert.equal(response.status(),200,`${path} must be served by the production Worker.`);
   await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.locator('body').innerText());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`${path} has horizontal overflow at 1440.`);
   if(path==='/docs/agents')await page.getByRole('heading',{name:'Company agent access',exact:true}).waitFor();
   if(path==='/app/settings?section=activity')assert.match(await page.locator('body').innerText(),/Agent door conformance for Morgan Lee/);
   await page.setViewportSize({width:390,height:844});
   if(path==='/app/settings?section=activity')await page.getByText('Agent door conformance for Morgan Lee',{exact:false}).first().scrollIntoViewIfNeeded();
   await page.screenshot({path:join(directory,label+'-390.png'),fullPage:false});
   await page.setViewportSize({width:1440,height:1000});
  }
  await context.close();
  console.log('Candidate browser proof at 1440 and 390:',directory);
 } catch(error) {console.error('Browser proof failed:',stage,error.name);throw error;} finally {await browser.close();}
}
