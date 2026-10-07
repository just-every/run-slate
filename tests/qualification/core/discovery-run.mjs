import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {discoveryBrowserChecks} from './discovery-browser.mjs';
const receipts=[];let r,browser;
try{
 r=await createRuntime({root:process.env.QUAL_ROOT??process.cwd(),evidence:process.env.QUAL_EVIDENCE,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT)});
 browser=await chromium.launch({headless:true});const context=await browser.newContext();await fixtureFirstOwner(r,context);const owner=(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ');
 await discoveryBrowserChecks({r,owner,context,check:async(clauses,id,fn)=>{try{await fn();receipts.push({clauses,id,outcome:'pass'});}catch(error){receipts.push({clauses,id,outcome:'fail',error:error.stack});process.exitCode=1;}console.log(receipts.at(-1));}});
 await writeFile(r.directory+'/discovery-browser.json',JSON.stringify({artifact:r.artifact.artifactHash,date:new Date().toISOString(),receipts,limits:'Local real routed browser portions, fixture substitutes mailbox possession only; no inference or full activity-context matrix.'},null,2));console.log(r.directory);
}finally{await browser?.close();await r?.close();}
