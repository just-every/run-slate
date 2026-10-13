import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createRuntime} from './runtime.mjs';
import {fixtureFirstOwner} from './first-owner.mjs';
const root=process.env.QUAL_ROOT??process.cwd(),evidence=process.env.QUAL_EVIDENCE;if(!evidence)throw Error('QUAL_EVIDENCE required');
let runtime,browser;
try{
 runtime=await createRuntime({root,evidence,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT)});
 assert.equal((await fetch(runtime.origin+'/api/workspace')).status,401);
 const caps=await (await fetch(runtime.origin+'/api/auth/capabilities')).json();assert.equal(caps.localOutbox,true);
 browser=await chromium.launch({headless:true});const context=await browser.newContext();const owner=await fixtureFirstOwner(runtime,context);
 await owner.page.screenshot({path:runtime.directory+'/first-run.png',fullPage:true});
 await writeFile(runtime.directory+'/smoke.json',JSON.stringify({passed:true,artifactHash:runtime.artifact.artifactHash,assertions:['anonymous private API denied','native development outbox enabled','real magic-token acceptance','real owner wizard creates exactly one workspace container page and actor'],limits:owner.limits},null,2));
 console.log(runtime.directory);
}catch(error){if(runtime)await writeFile(runtime.directory+'/smoke-failure.txt',error.stack);throw error;}finally{await browser?.close();await runtime?.close();}
