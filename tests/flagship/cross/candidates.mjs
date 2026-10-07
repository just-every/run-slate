import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

/** Retain exact source and emitted bytes; a later composition needs a new proof. */
export async function recordCandidates(root,evidence){
 const candidates=[];
 for(const [name,cwd] of [['slate',root],['happytohelp',process.env.H2H_RUNTIME_ROOT??path.resolve(root,'../happytohelp-delegation')],['orbit',process.env.ORBIT_RUNTIME_ROOT??path.resolve(root,'../orbit')]]){
  const git=async args=>(await promisify(execFile)('git',args,{cwd})).stdout.trim();
  const artifacts={};
  for(const file of ['dist/server/index.js','dist/server/wrangler.json'])artifacts[file]=createHash('sha256').update(await readFile(path.join(cwd,file))).digest('hex');
  candidates.push({name,cwd,commit:await git(['rev-parse','HEAD']),status:await git(['status','--porcelain']),artifacts,runtime:name==='slate'?'Vite Worker from source':'emitted Worker'});
 }
 await mkdir(evidence,{recursive:true});
 await writeFile(path.join(evidence,'candidates.json'),JSON.stringify({recordedAt:new Date().toISOString(),candidates,limits:'Local composition only; source changes require rerun.'},null,2));
}
