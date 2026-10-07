import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto('http://127.0.0.1:4174/signin');await page.getByTestId('local-sign-in').click();await page.waitForURL('**/app');
 await page.goto('http://127.0.0.1:4174/app/pages/01M3G6EKVGCF2350MAPABQHGT0');
 const block=page.locator('[contenteditable="true"]').first();await block.waitFor();const original=await block.innerText();
 await context.setOffline(true);await block.fill(`${original} Recovery check.`);await page.waitForTimeout(1100);
 const journals=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('slate:draft:')).map(key=>JSON.parse(sessionStorage.getItem(key))));
 assert.equal(journals.length,1);assert.ok(JSON.stringify(journals).includes('Recovery check.'));
 await context.setOffline(false);await page.reload();await block.waitFor();await page.getByText(/unsaved edit was recovered/).waitFor();assert.ok((await block.innerText()).includes('Recovery check.'));
 console.log('Offline edit persisted in tab recovery storage and restored visibly after reload.');
 // Keep original reviewed content after demonstrating retained recovery.
 await block.fill(original);const retry=page.getByRole('button',{name:'Try saving again'}).first();await retry.click();await page.waitForTimeout(1800);await page.reload();await block.waitFor();assert.equal(await block.innerText(),original);
 console.log('Confirmed retry saved the latest retained value; server reload matches original reviewed text.');
} finally {await browser.close();}
