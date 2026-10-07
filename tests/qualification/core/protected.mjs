import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const root=process.env.QUAL_ROOT??process.cwd(),base=process.env.QUAL_PROTECTED_BASE;
if(!base)throw Error('QUAL_PROTECTED_BASE must name the frozen baseline');
const git=async args=>(await promisify(execFile)('git',args,{cwd:root,encoding:'buffer',maxBuffer:128*1024*1024})).stdout;
const files=(await git(['ls-tree','-r','--name-only',base,'tests','migrations'])).toString().trim().split('\n');
assert.equal(files.length,130,'Frozen baseline has exactly 130 original test, fixture and migration inputs');
const hashes={};for(const file of files){const prior=await git(['show',base+':'+file]),current=await readFile(path.join(root,file));assert.ok(prior.equals(current),`Frozen input modified: ${file}`);hashes[file]=createHash('sha256').update(current).digest('hex');}
await writeFile(path.join(process.env.QUAL_EVIDENCE,'protected-inputs.json'),JSON.stringify({clauses:['FLAG-001','FLAG-002'],id:'frozen-existing-tests-fixtures-migrations-unchanged',base,commit:(await git(['rev-parse','HEAD'])).toString().trim(),date:new Date().toISOString(),count:files.length,hashes,packageDiff:(await git(['diff',base,'--','package.json','pnpm-lock.yaml'])).toString(),limits:'Byte preservation only; does not advance behavioral acceptance or claim existing suites were rerun.'},null,2));console.log(files.length,'frozen inputs unchanged');
