import {testDevKey} from '../../e2e/dev-key.mjs';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {launch,stop as stopProcess} from '../../qualification/local/process.mjs';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {qualificationPorts} from '../../qualification/local/ports.mjs';
export const root=process.cwd(),evidence=process.env.CROSS_EVIDENCE_DIR??path.resolve(root,'.artifacts','cross',String(Date.now()));
export const orbitRoot=path.resolve(process.env.ORBIT_RUNTIME_ROOT??path.resolve(root,'../orbit'));
const portBase=Number(process.env.CROSS_PORT_BASE??8760),portRange=process.env.CROSS_PORT_RANGE??'8700-8799';
for(let offset=0;offset<8;offset+=2)qualificationPorts(portBase+offset,portBase+offset+1,portRange);
export const restoreOrigin=`http://127.0.0.1:${portBase+6}`;
export const origins=Object.fromEntries(['happytohelp','orbit','slate'].map((name,index)=>[name,`http://127.0.0.1:${portBase+index*2}`]));
const runtimeRoot=cwd=>path.resolve(cwd)===path.resolve(root,'../orbit')?orbitRoot:cwd;
function runtimeArguments(args,origin){
 const result=[...args],appPort=Number(new URL(origin).port);
 for(const [flag,value] of [['--port',appPort],['--inspector-port',appPort+1]]){
  const index=result.indexOf(flag);if(index>=0)result[index+1]=String(value);
 }
 return result;
}
export function isolatedEnvironment(input=process.env){
 if(input.SLATE_PROFILE!==undefined&&!['core-wiki','flagship'].includes(input.SLATE_PROFILE))throw Error('Explicit Slate profile must be core-wiki or flagship');
 const allowed=['PATH','HOME','TMPDIR','TEMP','TMP','SystemRoot','LANG','LC_ALL','NODE_OPTIONS','XDG_CONFIG_HOME','XDG_CACHE_HOME','PLAYWRIGHT_BROWSERS_PATH','BROWSER'];
 return {...Object.fromEntries(allowed.filter(key=>input[key]!==undefined).map(key=>[key,input[key]])),...(input.SLATE_PROFILE?{SLATE_PROFILE:input.SLATE_PROFILE}:{}),CI:'1',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false',SLATE_AI_ENABLED:'false'};
}
export const environment=isolatedEnvironment();
export const inferenceBoundary={environment:'explicit OS whitelist; provider and inference variables excluded',configuredCredentials:'refused before launch',providerCalls:'not measured; no zero-call claim'};
async function requireNoInferenceConfig(cwd,args,env){
 const provider=/^(?:SLATE_)?(?:AI_(?:API_KEY|LOCAL_URL|LOCAL_TOKEN)|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY)$/;
 if(Object.entries(env).some(([key,value])=>provider.test(key)&&value))throw new Error('Inference credentials are forbidden in the native protocol qualification.');
 const configIndex=args.indexOf('--config'),config=args[configIndex+1];
 const dirs=new Set([cwd,path.join(cwd,'deploy'),path.join(cwd,'dist/server'),...(configIndex>=0?[path.dirname(path.resolve(cwd,config))]:[])]);
 for(const dir of dirs)for(const name of ['.dev.vars','.dev.vars.local','.env','.env.local','.env.development','.env.development.local']){
  try{const value=await readFile(path.join(dir,name),'utf8');if(/(?:AI_API_KEY|AI_LOCAL_URL|AI_LOCAL_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY)\s*[=:]/.test(value))throw new Error('Inference-bearing local configuration is forbidden: '+path.join(dir,name));}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 if(configIndex>=0){const value=await readFile(path.resolve(cwd,config),'utf8');if(/(?:AI_API_KEY|AI_LOCAL_URL|AI_LOCAL_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY)["']?\s*[=:]\s*["'][^"']+/.test(value))throw new Error('Inference-bearing runtime configuration is forbidden.');}
}

async function requireUnoccupiedOrigin(origin){
 const url=new URL(origin),port=Number(url.port||(url.protocol==='https:'?443:80));
 await new Promise((resolve,reject)=>{
  const probe=createServer();
  probe.once('error',error=>reject(new Error('Runtime origin is unavailable: '+origin,{cause:error})));
  probe.listen({host:url.hostname,port,exclusive:true},()=>probe.close(error=>error?reject(error):resolve()));
 });
}
const children=new Map();
export async function command(cwd,args,env=environment){return promisify(execFile)(process.execPath,args,{cwd:runtimeRoot(cwd),env,maxBuffer:10*1024*1024});}
export async function start(cwd,args,name,origin,env=environment){
 cwd=runtimeRoot(cwd);args=runtimeArguments(args,origin);
 const appPort=Number(new URL(origin).port);qualificationPorts(appPort,appPort+1,portRange);
 if(env.SLATE_INSPECTOR_PORT)env={...env,SLATE_INSPECTOR_PORT:String(Number(new URL(origin).port)+1)};
 if(cwd===root&&args[0]==='node_modules/vite/bin/vite.js'){
  await mkdir(evidence,{recursive:true});
  const settingsPath=path.join(evidence,name+'.dev.vars');
  const settings={APP_URL:origin,SETUP_OWNER_EMAIL:'jamie@aurora.example',SESSION_SECRET:env.SLATE_SESSION_SECRET??randomUUID(),MAIL_PROVIDER:'development',MAIL_FROM:'auth@test.invalid',LOCAL_DEVELOPMENT:'true',AI_ENABLED:'false',RER_DEV_KEY:testDevKey};
  await writeFile(settingsPath,Object.entries(settings).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600});
  env={...env,SLATE_LOCAL_SETTINGS_PATH:settingsPath};
 }
 await requireNoInferenceConfig(cwd,args,env);
 await requireUnoccupiedOrigin(origin);
 await requireUnoccupiedOrigin(new URL(origin).origin.replace(':'+appPort,':'+(appPort+1)));
 const proc=launch(process.execPath,args,{cwd,env});children.set(proc.child,proc);
 proc.logWritten=proc.ended.then(async result=>{
  await writeFile(path.join(evidence,name+'.log'),proc.output());
  await writeFile(path.join(evidence,name+'-process.json'),JSON.stringify({pid:proc.child.pid,processGroup:proc.child.pid,cwd,origin,exitCode:result.code,signal:result.signal,closedAt:new Date().toISOString()},null,2));
 });
 for(let n=0;n<240;n++){
  if(proc.child.exitCode!==null||proc.child.signalCode!==null){await stop(proc.child);throw Error(name+' exited: '+proc.output());}
  try{const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(1000)});if([200,503].includes(r.status))return proc.child;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 await stop(proc.child);throw Error(name+' readiness timed out: '+proc.output());
}
export async function stop(child){
 const proc=children.get(child);if(!proc)return;
 await stopProcess(proc);await proc.logWritten;children.delete(child);
}
export async function close(){for(const child of [...children.keys()].reverse())await stop(child);}
export async function prepareH2h(setupToken){const cwd=process.env.H2H_RUNTIME_ROOT??path.resolve(root,'../happytohelp-delegation'),server=path.join(cwd,'dist/server'),emitted=JSON.parse(await readFile(path.join(server,'wrangler.json'),'utf8')),configPath=path.join(evidence,'h2h-wrangler.json'),persist=path.join(evidence,'h2h-state');await mkdir(evidence,{recursive:true});await writeFile(configPath,JSON.stringify({...emitted,name:'cross-h2h',main:path.resolve(server,emitted.main),assets:{directory:path.resolve(server,emitted.assets.directory)},d1_databases:[{binding:'DB',database_name:'cross-h2h',database_id:'cross-h2h',migrations_dir:path.join(cwd,'.generated/migrations')}],r2_buckets:[{binding:'FILES',bucket_name:'cross-h2h'}],queues:{producers:[{binding:'JOBS',queue:'cross-h2h-jobs'}]},vars:{RER_INSTALLATION_ID:'cross-h2h-installation',H2H_SETUP_TOKEN:setupToken},no_bundle:true}),{mode:0o600});const cli=path.join(cwd,'node_modules/wrangler/bin/wrangler.js');await command(cwd,[cli,'d1','migrations','apply','DB','--local','--config',configPath,'--persist-to',persist]);await start(cwd,[cli,'dev','--local','--config',configPath,'--port','8760','--inspector-port','8761','--ip','127.0.0.1','--persist-to',persist],'happytohelp-runtime',origins.happytohelp);}
