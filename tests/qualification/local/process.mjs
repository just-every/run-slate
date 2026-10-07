import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
export const delay=ms=>new Promise(r=>{const timer=setTimeout(r,ms);timer.unref();});
export function safeEnvironment(){return {...Object.fromEntries(['PATH','HOME','TMPDIR','SystemRoot','PLAYWRIGHT_BROWSERS_PATH','NODE_OPTIONS','XDG_CONFIG_HOME','XDG_CACHE_HOME','BROWSER'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),CI:'1',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'};}
export function launch(command,args,{cwd,env=safeEnvironment()}={}){
 const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:true});let output='';
 child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 const ended=new Promise(resolve=>{child.once('error',error=>resolve({error}));child.once('close',(code,signal)=>resolve({code,signal}));});
 return {child,ended,output:()=>output};
}
export async function stop(proc){if(!proc)return;const kill=signal=>{try{process.kill(-proc.child.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}};kill('SIGTERM');const done=await Promise.race([proc.ended,delay(5000).then(()=>null)]);if(!done){kill('SIGKILL');if(!await Promise.race([proc.ended,delay(5000).then(()=>null)]))throw Error('Owned runtime did not terminate');}}
export async function command(command,args,options={}){const proc=launch(command,args,options);const result=await Promise.race([proc.ended,delay(options.timeout??120000).then(()=>null)]);if(!result){await stop(proc);throw Error('Command timed out: '+args[0]);}if(options.log)await writeFile(options.log,proc.output());if(result.error||result.code!==0)throw Error(`Command failed (${result.code}): ${proc.output()}`,{cause:result.error});return proc.output();}
