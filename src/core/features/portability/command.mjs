#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
const [command,file]=process.argv.slice(2);
if(!['backup','restore'].includes(command)||!file)throw new Error('Usage: node src/core/features/portability/command.mjs backup|restore ARCHIVE.zip');
const origin=process.env.SLATE_APP_URL,cookie=process.env.SLATE_SESSION_COOKIE;
if(!origin||!cookie)throw new Error('SLATE_APP_URL and an authenticated owner SLATE_SESSION_COOKIE are required.');
const base=new URL(origin);if(base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))throw new Error('Use HTTPS except on a loopback local runtime.');
async function call(path,options={}){const response=await fetch(new URL(path,base),{...options,headers:{Cookie:cookie,Origin:base.origin,...options.headers},redirect:'error'});if(!response.ok)throw new Error(`Slate ${response.status}: ${await response.text()}`);return response;}
if(command==='backup'){const job=await(await call('/api/exports/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationKey:crypto.randomUUID()})})).json();const archive=await call(`/api/exports/${job.id}/download`);await writeFile(file,new Uint8Array(await archive.arrayBuffer()),{flag:'wx',mode:0o600});console.log(JSON.stringify({id:job.id,state:job.state,file,counts:job.counts}));}
else {const body=new FormData();body.set('file',new Blob([await readFile(file)],{type:'application/zip'}),'workspace.zip');console.log(JSON.stringify(await(await call('/api/exports/restore',{method:'POST',body})).json()));}
