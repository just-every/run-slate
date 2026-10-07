import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {command,safeEnvironment} from '../local/process.mjs';
import {identity} from '../local/identity.mjs';
const root=path.resolve(process.env.QUAL_ROOT??process.cwd()),evidence=path.resolve(process.env.QUAL_EVIDENCE);
await mkdir(evidence,{recursive:true});const directory=await mkdtemp(path.join(evidence,'clean-')),clone=path.join(directory,'repository'),before=await identity(root);
try{
 await command('git',['clone','--no-hardlinks','--no-local',root,clone],{log:path.join(directory,'clone.log')});
 await command('git',['checkout','--detach',before.commit],{cwd:clone});
 assert.equal((await command('git',['status','--porcelain'],{cwd:clone})).trim(),'');
 await command('pnpm',['install','--frozen-lockfile'],{cwd:clone,log:path.join(directory,'install.log')});
 await command('pnpm',['build'],{cwd:clone,log:path.join(directory,'build.log')});
 const cloned=await identity(clone);assert.deepEqual(cloned.inputs,before.inputs);assert.deepEqual((await identity(root)).inputs,before.inputs);
 await command(process.execPath,['tests/qualification/local/smoke.mjs'],{cwd:clone,env:{...safeEnvironment(),QUAL_ROOT:clone,QUAL_EVIDENCE:directory,QUAL_APP_PORT:process.env.QUAL_APP_PORT,QUAL_INSPECTOR_PORT:process.env.QUAL_INSPECTOR_PORT},log:path.join(directory,'smoke.log')});
 await writeFile(path.join(directory,'clean.json'),JSON.stringify({clauses:['FLAG-002'],id:'clean-clone-frozen-install-build-emitted-smoke-protected-inputs',date:new Date().toISOString(),commit:before.commit,originalArtifact:before.artifactHash,cleanArtifact:cloned.artifactHash,inputHashesMatch:true,originalInputsUnchanged:true,limits:'Local clean clone and first-run emitted smoke only; no customization, restore, provider, distribution or release acceptance.'},null,2));console.log(directory);
}catch(error){await writeFile(path.join(directory,'failure.txt'),error.stack);throw error;}
