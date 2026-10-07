import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRuntime} from '../local/runtime.mjs';
const r=await createRuntime({root:process.cwd(),evidence:process.env.QUAL_EVIDENCE,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT),omitVariables:['SESSION_SECRET'],expectedHealthStatus:503});
try{const checks=[];for(const route of ['/health','/','/signin','/app','/api/workspace','/_serverFn/'+'0'.repeat(64)]){const response=await fetch(r.origin+route);const body=await response.text();assert.equal(response.status,503);assert.match(body,/SESSION_SECRET/);checks.push({route,status:response.status});}await writeFile(r.directory+'/configuration.json',JSON.stringify({date:new Date().toISOString(),clause:'BASE-SECRET-002',assertion:'missing-session-secret-fails-all-request-families-closed',artifact:r.artifact.artifactHash,checks},null,2));console.log(r.directory);}finally{await r.close();}
