import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
export async function visualChecks({page,runtime,id,databaseId,check}){
 const routes=[['home','/app'],['search','/app/search'],['inbox','/app/inbox'],['settings','/app/settings'],['templates','/app/templates'],['containers','/app/containers'],['database','/app/databases/'+databaseId],['comments','/app/pages/'+id+'?detail=comments'],['share','/app/pages/'+id+'?detail=share']];
 const results=[];
 for(const [name,path]of routes){
  await page.goto(runtime.origin+path);await page.locator('h1').first().waitFor();await page.waitForLoadState('networkidle');await page.waitForFunction(()=>!document.querySelector('.request-loading'));assert.equal(await page.locator('.request-notice[role=alert]').count(),0,`${name} loaded with an error`);
  for(const width of [320,390,430,1440]){
   await page.setViewportSize({width,height:900});await page.screenshot({path:`${runtime.directory}/screen-${name}-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflow ${width}`);
   if(width===320||width===1440){const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();results.push({name,width,violations:result.violations});await writeFile(runtime.directory+'/routed-axe.json',JSON.stringify(results,null,2));assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${name} axe ${width}`);}
  }
 }
 await page.goto(runtime.origin+'/app/settings?section=appearance');await page.getByRole('radio',{name:'Dark',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await page.reload();await page.getByRole('radio',{name:'Dark',exact:true}).waitFor();await page.waitForLoadState('networkidle');
 for(const width of [320,1440]){await page.setViewportSize({width,height:900});const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();results.push({name:'settings-dark',width,violations:result.violations});await writeFile(runtime.directory+'/routed-axe.json',JSON.stringify(results,null,2));assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);await page.screenshot({path:`${runtime.directory}/settings-dark-${width}.png`,fullPage:true});}
 await page.getByRole('radio',{name:'Light',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await page.setViewportSize({width:390,height:900});await page.goto(runtime.origin+'/app');await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:/^Search/}).click();await page.waitForURL(/\/app\/search/);assert.equal(await page.locator('.app').getAttribute('data-navigation-open'),'false');
 check(['BASE-UI-001','NAV-006'],'Nine actual routed screens: axe at 320/1440, screenshots and overflow at 320/390/430/1440; mobile navigation performs real search route');
}
