import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {api} from './support.mjs';
export async function shellChecks({r,owner,check,context}){
 const page=await context.newPage();try{
 await check(['WORK-011','WORK-012'],'settings-shell-theme-and-personal-preferences-survive-reload',async()=>{
 await page.goto(r.origin+'/app/settings');const nav=page.getByRole('navigation',{name:'Settings sections'});await nav.waitFor();
 for(const label of ['Workspace','People','Appearance','Preferences','Statuses','Connections','Import & export'])assert.equal(await nav.getByRole('button',{name:label,exact:true}).count(),1);
 await nav.getByRole('button',{name:'Appearance',exact:true}).click();await page.getByRole('radio',{name:'Dark',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await page.reload();await page.getByRole('radio',{name:'Dark',exact:true}).waitFor();assert.equal(await page.getByRole('radio',{name:'Dark',exact:true}).isChecked(),true);
 await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/members/current/theme')&&response.request().method()==='PUT'),page.getByRole('radio',{name:'Match device',exact:true}).click()]);
 await nav.getByRole('button',{name:'Preferences',exact:true}).click();await page.getByLabel('Timezone').fill('Australia/Brisbane');await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/navigation/preferences')&&response.request().method()==='PUT'),page.getByRole('button',{name:'Save preferences',exact:true}).click()]);await page.reload();assert.equal(await page.getByLabel('Timezone').inputValue(),'Australia/Brisbane');assert.equal((await api(r,'/api/navigation/preferences',owner)).data.value.timezone,'Australia/Brisbane');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:r.directory+'/settings-mobile.png',fullPage:true});
 });
 await check(['WORK-011','BASE-PUBLIC-003'],'mobile-touch-navigation-and-keyboard-skip-link',async()=>{
 const mobile=await context.browser().newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});try{
 await mobile.addCookies(await context.cookies());const touch=await mobile.newPage();await touch.goto(r.origin+'/app');await touch.getByRole('button',{name:'Open navigation',exact:true}).tap();await touch.getByTestId('workspace-name').waitFor();assert.equal(await touch.getByTestId('workspace-name').innerText(),(await api(r,'/api/workspace',owner)).data.name);await touch.getByRole('navigation',{name:'Workspace navigation',exact:true}).getByRole('link',{name:'Search',exact:false}).tap();await touch.waitForURL('**/app/search');await touch.getByRole('button',{name:'Open navigation',exact:true}).waitFor();assert.equal(await touch.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await touch.screenshot({path:r.directory+'/touch-search.png',fullPage:true});
 }finally{await mobile.close();}
 const keys=await context.newPage();try{await keys.setViewportSize({width:1280,height:900});await keys.goto(r.origin+'/app');await keys.waitForLoadState('networkidle');await keys.bringToFront();await keys.keyboard.press('Tab');assert.equal(await keys.locator(':focus').innerText(),'Skip to content');await keys.keyboard.press('Enter');assert.equal(await keys.evaluate(()=>location.hash),'#workspace-content');}finally{await keys.close();}
 });
 await check(['WORK-014'],'shortcut-reference-opens-with-one-shortcut-across-shell',async()=>{
 for(const route of ['/app','/app/settings','/app/inbox']){await page.goto(r.origin+route);await page.waitForLoadState('networkidle');await page.keyboard.press('Control+/');await page.getByRole('dialog',{name:'Keyboard shortcuts'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Keyboard shortcuts'}).count(),0);}
 });
 await writeFile(r.directory+'/settings-text.txt',await page.locator('body').innerText());
 }finally{await page.close();}
}
