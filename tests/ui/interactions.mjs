import assert from 'node:assert/strict';
import { checkEditorInteractions } from './editor-interactions.mjs';
/** Callback rejection must retain the draft; a successful explicit retry clears it. */
export async function checkInteractions(browser, base) {
 const context=await browser.newContext();
 try {
  const page=await context.newPage();
  await page.goto(`${base}/?story=comment-submit-retry`);
  const field=page.getByRole('textbox',{name:'Write a comment'});
  await field.fill('Keep this unsent comment');
  await page.getByRole('button',{name:'Send comment',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(),/Connection lost/);
  assert.equal(await field.inputValue(),'Keep this unsent comment');
  await page.getByRole('button',{name:'Send comment',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');
  assert.equal(await field.inputValue(),'');
  assert.equal(await page.getByRole('alert').count(),0);
  const editor = await checkEditorInteractions(page,base);
  return [{name:'failed comment retains draft and successful retry clears it',passed:true},editor];
 }finally{await context.close();}
}
