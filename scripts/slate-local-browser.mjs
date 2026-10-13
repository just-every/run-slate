import { signInBrowser } from '../tests/e2e/outbox-auth.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const origin=process.env.SLATE_BROWSER_ORIGIN??'http://127.0.0.1:8740';
const output=process.env.SLATE_BROWSER_EVIDENCE??'.artifacts/browser';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await signInBrowser(page, origin, process.env.SLATE_BROWSER_EMAIL ?? 'jamie@aurora.example');await page.waitForLoadState('networkidle');if(await page.getByRole('heading',{name:'Name this workspace',exact:true}).isVisible()){await page.getByLabel('Workspace name',{exact:true}).fill('Slate local qualification');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('textbox',{name:'Space name',exact:true}).fill('Qualification');await page.getByLabel('First page title').fill('Launch readiness');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Skip this step'}).click();}await page.waitForLoadState('networkidle');await page.locator('main h1').first().waitFor({timeout:60000});
 await page.screenshot({path:output+'/desktop-app.png',fullPage:true});
 await page.goto(origin+'/app/settings');await page.getByRole('heading',{name:'Workspace settings',exact:true}).waitFor({timeout:60000});await page.screenshot({path:output+'/desktop-settings.png',fullPage:true});
 await writeFile(output+'/settings-text.txt',await page.locator('body').innerText());
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/narrow-settings.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Narrow settings must not overflow');
 assert.deepEqual(errors,[]);await writeFile(output+'/result.json',JSON.stringify({origin,errors,desktop:[1440,1000],narrow:[390,844],interceptedApi:false},null,2));
}finally{await browser.close();}
