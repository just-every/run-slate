import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,chmod,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
assert.ok(process.env.PRIOR_EVIDENCE,'PRIOR_EVIDENCE must identify the existing sealed execution evidence directory');
assert.ok(path.isAbsolute(process.env.PRIOR_EVIDENCE),'PRIOR_EVIDENCE must be absolute');
export const evidence=path.resolve(process.env.PRIOR_EVIDENCE);
export const output=path.join(evidence,'candidate-proof');
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const json=async p=>JSON.parse(await readFile(p,'utf8'));
export async function save(name,value){await mkdir(path.dirname(path.join(output,name)),{recursive:true});await writeFile(path.join(output,name),JSON.stringify(value,null,2));}
export const {command,delay}=await import(path.join(evidence,'harness/process.mjs'));
export const {runtime,free}=await import(path.join(evidence,'harness/runtime.mjs'));
export const {launchBrowser}=await import(path.join(evidence,'harness/browser.mjs'));
export async function seal(){const manifest=await json(path.join(evidence,'sealed-baseline-manifest.json'));for(const [file,hash]of Object.entries(manifest))assert.equal(sha(await readFile(path.join(evidence,'sealed-baseline-state',file))),hash,file);return {files:Object.keys(manifest).length,manifestHash:sha(JSON.stringify(manifest))};}
export async function copySeal(destination){await seal();await cp(path.join(evidence,'sealed-baseline-state'),destination,{recursive:true,errorOnExist:true,force:false});async function writable(p){const entries=await readdir(p,{withFileTypes:true});await chmod(p,0o700);for(const e of entries){const f=path.join(p,e.name);if(e.isDirectory())await writable(f);else await chmod(f,0o600);}}await writable(destination);}
export async function snapshot(persist,label){const destination=path.join(output,label+'.json');await command('python3',[path.join(evidence,'harness/snapshot.py'),persist,destination]);return json(destination);}
export async function oracle(mode,left,right,label){const result=await command('python3',[path.join(import.meta.dirname,'oracle.py'),mode,left,right],{log:path.join(output,label+'.log')});await save(label+'.json',JSON.parse(result));}
export function requestFor(context,label){let n=0;return async(route,{method='GET',data,multipart,statuses=[200]}={})=>{const response=await context.request.fetch('http://127.0.0.1:8730'+route,{method,data,multipart});const text=await response.text();await save(`receipts/${label}-${++n}.json`,{route,method,data,status:response.status(),body:text});assert.ok(statuses.includes(response.status()),`${method} ${route}: ${response.status()} ${text}`);return text?JSON.parse(text):null;};}
