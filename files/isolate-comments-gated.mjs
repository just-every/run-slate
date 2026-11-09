import { withWorkspace } from '../tests/qualification/ui-convergence/browser-support.mjs';
import { ok } from '../tests/qualification/ui-convergence/two-people-support.mjs';
import { commentAuthorshipJourney } from './comments-gated-subject.mjs';
import { writeFile } from 'node:fs/promises';
globalThis.commentsGate = {
 async arm(person, path) {
  let done, release;
  const captured = new Promise(resolve => { done = resolve; });
  this.captured = () => captured;
  const held = new Promise(resolve => { release = resolve; });
  this.release = release;
  await person.page.route(url => url.pathname === path, async route => {
   const response = await route.fetch({maxRetries:0});
   const data = await response.json();
   console.log('CONTROLLED_RESPONSE '+JSON.stringify({status:response.status(),comments:data.comments.map(c=>({id:c.id,body:c.body,deletedAt:c.deletedAt}))}));
   done();
   await held;
   await route.fulfill({response});
  });
 },
 async visible(person, check) {
  const pending = check();
  await this.captured();
  const before = await person.page.locator('.comment').evaluateAll(items=>items.map(item=>item.id));
  this.release();
  await pending;
  const after = await person.page.locator('.comment').evaluateAll(items=>items.map(item=>item.id));
  console.log('CONTROLLED_RENDER '+JSON.stringify({before,after}));
 }
};
const width = Number(process.env.PROBE_WIDTH ?? 390);
const rows = [];
for (let trial=1; trial<=Number(process.env.PROBE_TRIALS ?? 3); trial++) {
 const start=Date.now();
 try {
  await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
   await ok(state.context,state.origin,'POST','/api/workspace/first-run',{operationKey:crypto.randomUUID(),workspaceName:'Field notes',containerName:'Handbook',pageTitle:'Welcome'});
   await commentAuthorshipJourney(state,width);
  });
  rows.push({trial,width,status:'pass',elapsedMs:Date.now()-start});
 } catch(e) {
  rows.push({trial,width,status:'fail',elapsedMs:Date.now()-start,message:e.message,actual:e.actual,expected:e.expected,stack:e.stack});
 }
 console.log('COMMENTS_RESULT '+JSON.stringify(rows.at(-1)));
}
await writeFile(process.env.PROBE_RESULT ?? '.artifacts/comments-natural.json',JSON.stringify(rows,null,2)+'\n');
