import { withWorkspace } from '../tests/qualification/ui-convergence/browser-support.mjs';
import { ok } from '../tests/qualification/ui-convergence/two-people-support.mjs';
import { commentAuthorshipJourney } from '../tests/qualification/ui-convergence/comments-journey.mjs';
import { writeFile } from 'node:fs/promises';
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
