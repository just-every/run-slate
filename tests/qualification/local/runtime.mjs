import {launchMailRuntime} from '../../e2e/mail-runtime.mjs';
import {testDevKey} from '../../e2e/dev-key.mjs';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {command,launch,stop,delay} from './process.mjs';
import {identity} from './identity.mjs';
import {qualificationPorts} from './ports.mjs';
async function free(port){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
/** Real emitted Worker. Caller must close in finally. No provider credentials are inherited. */
export async function createRuntime({root,evidence,appPort,inspectorPort,portRange,omitVariables=[],expectedHealthStatus=200,mailProvider='development'}){
 const ports=qualificationPorts(appPort,inspectorPort,portRange);
 if(![200,503].includes(expectedHealthStatus))throw Error('Expected health must be 200 or explicit negative 503');
 const allowedOmissions=['APP_URL','SETUP_OWNER_EMAIL','SESSION_SECRET','MAIL_PROVIDER','MAIL_FROM','MAIL_API_KEY'];if(omitVariables.some(x=>!allowedOmissions.includes(x)))throw Error('Only required configuration may be omitted');
 if(appPort===inspectorPort)throw Error('App and inspector ports must differ');
 root=path.resolve(root);evidence=path.resolve(evidence);await mkdir(evidence,{recursive:true});
 const directory=await mkdtemp(path.join(evidence,'runtime-')),persist=path.join(directory,'state'),configPath=path.join(directory,'wrangler.json');
 await writeFile(path.join(directory,'ports.json'),JSON.stringify(ports,null,2));
 const origin=`http://127.0.0.1:${appPort}`,sessionSecret=randomUUID();let proc;let generation=0;let storageQueue=Promise.resolve();const storageOperations=[];
 const artifact=await identity(root);await writeFile(path.join(directory,'identity.json'),JSON.stringify(artifact,null,2));
 const server=path.join(root,'dist/server'),emitted=JSON.parse(await readFile(path.join(server,'wrangler.json'),'utf8'));
 const config={...emitted,main:path.resolve(server,emitted.main),assets:{...emitted.assets,directory:path.resolve(server,emitted.assets.directory)},d1_databases:emitted.d1_databases.map(db=>({...db,migrations_dir:path.join(root,'migrations/core')})),vars:{...(process.env.SLATE_PROFILE ? {SLATE_PROFILE:process.env.SLATE_PROFILE} : {}),APP_URL:origin,SETUP_OWNER_EMAIL:'qualification-owner@test.invalid',SESSION_SECRET:sessionSecret,MAIL_PROVIDER:mailProvider, MAIL_FROM:'qualification@test.invalid',MAIL_API_KEY:'TEST-FIXTURE-NOT-A-PROVIDER-CREDENTIAL',LOCAL_DEVELOPMENT:mailProvider==='development'?'true':'false',...(mailProvider==='development'?{RER_DEV_KEY:testDevKey}:{}),AI_ENABLED:'false',SSO_ENABLED:'false',LINK_PREVIEWS_ENABLED:'false'},no_bundle:true};
 for(const name of omitVariables)delete config.vars[name];
 await writeFile(configPath,JSON.stringify(config,null,2),{mode:0o600});
 const cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
 const run=(args,log)=>command(process.execPath,[cli,...args,'--local','--config',configPath,'--persist-to',persist],{cwd:directory,log:log&&path.join(directory,log)});
 const close=async()=>{if(!proc)return;await stop(proc);const result=await proc.ended;await writeFile(path.join(directory,`worker-${generation}-process.json`),JSON.stringify({pid:proc.child.pid,processGroup:proc.child.pid,appPort,inspectorPort,exitCode:result.code,signal:result.signal,closedAt:new Date().toISOString()},null,2));const log=proc.output().replaceAll(sessionSecret,'<redacted-test-session-secret>');await writeFile(path.join(directory,`worker-${generation}.log`),log,{mode:0o600});await writeFile(path.join(directory,'worker.log'),log,{mode:0o600});proc=undefined;};
 const start=async()=>{
 await free(appPort);await free(inspectorPort);generation++;
 proc=await launchMailRuntime({root,configPath,persist,port:appPort,variables:config.vars});
 const deadline=Date.now()+60000;let ready=false;while(Date.now()<deadline){if(proc.child.exitCode!==null)throw Error(proc.output());try{const res=await fetch(origin+'/health',{signal:AbortSignal.timeout(1000)});if(res.status===expectedHealthStatus){ready=true;break;}}catch{}await delay(200);}if(!ready)throw Error('Worker readiness timeout: '+proc.output());
 };
 try{
 await free(appPort);await free(inspectorPort);
 await run(['d1','migrations','apply','DB'],'migrations.log');
 await start();
 return {root,directory,persist,origin,sessionSecret,artifact,async close(){await storageQueue;await close();},async restart(){await storageQueue;await close();try{await start();}catch(error){await close();throw error;}},sql(sql){
 const operation=storageQueue.then(async()=>{
 const record={ordinal:storageOperations.length+1,startedAt:new Date().toISOString(),workerGeneration:generation,kind:'explicit-worker-stop-local-D1-operation-restart',outcome:'pending'};storageOperations.push(record);
 await close();let result,storageError;
 try{result=JSON.parse(await run(['d1','execute','DB','--command',sql,'--json']));record.outcome='pass';}catch(error){storageError=error;record.outcome='fail';record.error=error.stack;}
 try{await start();}catch(error){await close();record.outcome='fail';record.restartError=error.stack;if(storageError)storageError=new AggregateError([storageError,error],'Local D1 operation and Worker restart failed');else storageError=error;}
 record.finishedAt=new Date().toISOString();await writeFile(path.join(directory,'storage-operations.json'),JSON.stringify({limits:'Qualification fixtures and persisted probes explicitly interrupt the local Worker to give one process ownership of SQLite. Not native application mutation or availability evidence.',operations:storageOperations},null,2));
 if(storageError)throw storageError;return result;
 });storageQueue=operation.then(()=>undefined,()=>undefined);return operation;
 }};
 }catch(error){await writeFile(path.join(directory,'failure.txt'),(error.stack??String(error)).replaceAll(sessionSecret,'<redacted-test-session-secret>'));await close();throw error;}
}
