import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const runner=fileURLToPath(new URL('./run.mjs',import.meta.url));
for(const [mode,expected] of [['install',['install','--offline','--frozen-lockfile']],['build',['exec','vite','build']]]){
 test(`journey ${mode} resolves installed pnpm on PATH from another root with safe environment`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'slate runner portability '));
  try{
   const bin=join(root,'installed tools'),cwd=join(root,'owner checkout'),evidence=join(root,'evidence');
   await mkdir(bin);await mkdir(cwd);
   // A process-boundary probe, not an application fixture: observe what the runner invokes.
   await writeFile(join(bin,'pnpm'),`#!${process.execPath}\nconsole.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),env:process.env}));\n`,{mode:0o755});
   const result=spawnSync(process.execPath,[runner,mode],{cwd,encoding:'utf8',env:{PATH:bin,QUAL_EVIDENCE:evidence,CLOUDFLARE_API_TOKEN:'must-not-inherit',OPENAI_API_KEY:'must-not-inherit',SENDGRID_API_KEY:'must-not-inherit'}});
   assert.equal(result.status,0,result.stderr);
   const observed=JSON.parse((await readFile(join(evidence,mode+'.log'),'utf8')).trim());
   assert.deepEqual(observed.args,expected);
   assert.equal(observed.cwd,await realpath(cwd));
   for(const key of ['CLOUDFLARE_API_TOKEN','OPENAI_API_KEY','SENDGRID_API_KEY','QUAL_EVIDENCE'])assert.equal(observed.env[key],undefined,key);
   assert.equal(observed.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD,'1');
   assert.equal(observed.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV,'false');
   assert.equal(observed.env.WRANGLER_SEND_METRICS,'false');
   assert.equal(observed.env.CI,'1');
  }finally{await rm(root,{recursive:true,force:true});}
 });
}
