import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';import {fileURLToPath} from 'node:url';import {dirname,resolve} from 'node:path';import {createServer} from 'node:net';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=process.env.SLATE_AI_LOCAL_PORT ? Number(process.env.SLATE_AI_LOCAL_PORT) : await new Promise((resolve,reject)=>{const socket=createServer();socket.on('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const token=randomBytes(32).toString('hex');const model=process.env.SLATE_AI_MODEL??'gpt-6-astra';
const bridge=spawn(process.execPath,[resolve(root,'local-agent/server.mjs')],{cwd:root,stdio:['ignore','pipe','inherit'],env:{...process.env,SLATE_AI_LOCAL_TOKEN:token,SLATE_AI_MODEL:model,SLATE_AI_LOCAL_PORT:String(port)}});
await new Promise((resolve,reject)=>{bridge.stdout.once('data',resolve);bridge.once('error',reject);bridge.once('exit',()=>reject(new Error('Local inference bridge did not start.')));});
const app=spawn(process.execPath,[resolve(root,'scripts/dev.mjs'),...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:{...process.env,SLATE_AI_ENABLED:'true',SLATE_AI_PROVIDER:'local-codex',SLATE_AI_LOCAL_URL:`http://127.0.0.1:${port}`,SLATE_AI_LOCAL_TOKEN:token,SLATE_AI_MODEL:model}});
let closing=false;async function close(){if(closing)return;closing=true;app.kill('SIGTERM');bridge.kill('SIGTERM');const timer=setTimeout(()=>{if(app.exitCode===null)app.kill('SIGKILL');if(bridge.exitCode===null)bridge.kill('SIGKILL');},2000);timer.unref();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,close);app.once('exit',async code=>{await close();process.exitCode=code??1;});bridge.once('exit',()=>{if(!closing)close();});
