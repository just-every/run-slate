import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/** Browser proof uses only the disposable production application's real doors. */
export async function browserProof({request,origin,cookie,taskPageId,taskActor,preparedPublicPath,publishedPublicPath}) {
 const directory=await mkdtemp(join(tmpdir(),'slate-agent-proof-'));
 let stage='launch',page;
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
  page=await context.newPage();
  const screens=[['/agents','agents'],['/docs/agents','agent-docs'],['/app/settings?section=activity','native-activity']];
  if(taskPageId)screens.push(['/app/pages/'+taskPageId,'native-agent-task']);
  if(preparedPublicPath)screens.push([preparedPublicPath,'native-agent-public-edit']);
  if(publishedPublicPath)screens.push([publishedPublicPath,'native-agent-public-publish']);
  for(const [path,label] of screens) {
   stage=path;
   const response=await page.goto(origin+path,{waitUntil:'networkidle'});
   if(label==='native-activity') {
    const change=async action=>{
     const [response]=await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/activity'),action()]);
     assert.equal(response.status(),200,'Native activity pagination must succeed.');
     const data=await response.json();
     await page.locator('section.settings-panel[aria-busy="false"]').waitFor();
     if(data.items.length)await page.locator('[data-activity-id='+JSON.stringify(data.items[0].id)+']').waitFor();
     return data;
    };
    await page.getByLabel('Action',{exact:true}).fill('pages.update');
    let activity=await change(()=>page.getByRole('button',{name:'Filter activity',exact:true}).click());
    const actor=page.getByText('Agent door conformance for Morgan Lee',{exact:false});
    while(!activity.items.some(item=>item.actor?.displayName==='Agent door conformance for Morgan Lee')&&activity.nextCursor) {
     activity=await change(()=>page.getByRole('button',{name:'Earlier activity',exact:true}).click());
    }
    await actor.first().waitFor();await actor.first().scrollIntoViewIfNeeded();
   }
   await page.screenshot({path:join(directory,label+'-1440.png'),fullPage:false});
   assert.equal(response.status(),200,`${path} must be served by the production Worker.`);
   await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.locator('body').innerText());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`${path} has horizontal overflow at 1440.`);
   if(path==='/docs/agents')await page.getByRole('heading',{name:'Company agent access',exact:true}).waitFor();
   if(label==='native-agent-task') {
    await page.getByText('Completed by '+taskActor,{exact:false}).first().waitFor();
    const box=await page.getByRole('checkbox',{name:'Mark complete: Review the support handoff before publishing.',exact:true}).boundingBox();
    assert.ok(box&&box.width>=44&&box.height>=44,'The changed task control must have a 44px target.');
   }
   if(label==='native-agent-public-edit')await page.getByText('Prepared by Agent door conformance for Morgan Lee',{exact:true}).waitFor();
   if(label==='native-agent-public-publish')await page.getByText('Published by Agent door conformance for Morgan Lee',{exact:true}).waitFor();
   if(path==='/app/settings?section=activity')assert.match(await page.locator('body').innerText(),/Agent door conformance for Morgan Lee/);
   await page.setViewportSize({width:390,height:844});
   if(label==='native-agent-task')await page.getByText('Completed by '+taskActor,{exact:false}).first().scrollIntoViewIfNeeded();
   if(path==='/app/settings?section=activity')await page.getByText('Agent door conformance for Morgan Lee',{exact:false}).first().scrollIntoViewIfNeeded();
   await page.screenshot({path:join(directory,label+'-390.png'),fullPage:false});
   await page.setViewportSize({width:1440,height:1000});
  }
  await context.close();
  console.log('Candidate browser proof at 1440 and 390:',directory);
 } catch(error) {
  if(page){await page.screenshot({path:join(directory,'failed-screen.png'),fullPage:false}).catch(()=>{});await writeFile(join(directory,'failed-screen.txt'),await page.locator('body').innerText().catch(()=>''));}
  console.error('Browser failure evidence:',directory);
  console.error('Browser proof failed:',stage,error.name,String(error.message).split('\n').slice(0,3).join(' '));throw error;} finally {await browser.close();}
}
