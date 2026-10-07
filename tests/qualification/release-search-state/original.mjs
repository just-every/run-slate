import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {discoveryBrowserChecks} from '../core/discovery-browser.mjs';
import {traceSearch} from './trace.mjs';
const receipts=[];let r,browser,flush;
try {
 r=await createRuntime({root:process.env.QUAL_ROOT??process.cwd(),evidence:process.env.QUAL_EVIDENCE,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT)});
 browser=await chromium.launch({headless:true});const context=await browser.newContext();
 if(process.env.SEARCH_DELAY_ROUTE==='true')await context.route('**/assets/app.search-*.js',async route=>{
  await new Promise(resolve=>setTimeout(resolve,750));await route.continue();
 });
 flush=await traceSearch(context,r.directory);
 await fixtureFirstOwner(r,context);const owner=(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ');
 await discoveryBrowserChecks({r,owner,context,check:async(clauses,id,fn)=>{
  try{await fn();receipts.push({clauses,id,outcome:'pass'});}catch(error){receipts.push({clauses,id,outcome:'fail',error:error.stack});process.exitCode=1;}
  console.log(receipts.at(-1));
 }});
 await writeFile(r.directory+'/original.json',JSON.stringify({artifact:r.artifact.artifactHash,commit:r.artifact.commit,receipts},null,2));
 console.log(r.directory);
}finally{await browser?.close();await flush?.();await r?.close();}
