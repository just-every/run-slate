import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {publicChecks} from './public.mjs';
import {shellChecks} from './shell.mjs';
import {baselineChecks} from './baseline.mjs';
import {discoveryChecks} from './discovery.mjs';
import {identityChecks} from './identity.mjs';
import {discoveryBrowserChecks} from './discovery-browser.mjs';
const receipts=[];let r,browser;
try{
 r=await createRuntime({root:process.env.QUAL_ROOT??process.cwd(),evidence:process.env.QUAL_EVIDENCE,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT)});
 browser=await chromium.launch({headless:true});const context=await browser.newContext(),first=await fixtureFirstOwner(r,context),owner=(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ');
 async function check(clauses,id,fn){try{await fn();receipts.push({clauses,id,outcome:'pass'});console.log('PASS',id);}catch(error){receipts.push({clauses,id,outcome:'fail',error:error.stack});console.log('FAIL',id,error.message);}await writeFile(r.directory+'/receipts.json',JSON.stringify({artifact:r.artifact.artifactHash,date:new Date().toISOString(),profile:'default; AI off; sample data off; fixture mailbox possession',limits:'Assertions are scoped local portions, not complete clause acceptance, provider evidence, whole baseline or release acceptance.',receipts},null,2));}
 await identityChecks({r,owner,check,context});
 await discoveryChecks({r,owner,check});
 await discoveryBrowserChecks({r,owner,check,context});
 await shellChecks({r,owner,check,context});
 await baselineChecks({r,owner,check,browser,context});
 await publicChecks({r,check,browser});
 console.log('Evidence:',r.directory);if(receipts.some(r=>r.outcome==='fail'))process.exitCode=1;
}finally{await browser?.close();await r?.close();}
