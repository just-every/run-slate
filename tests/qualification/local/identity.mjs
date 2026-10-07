import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {command} from './process.mjs';
export async function identity(root){
 const tracked=(await command('git',['ls-files','-z'],{cwd:root})).split('\0').filter(Boolean).filter(p=>!p.startsWith('tests/qualification/'));
 const hash=async p=>createHash('sha256').update(await readFile(path.join(root,p))).digest('hex');
 const inputs={};for(const p of tracked)inputs[p]=await hash(p);
 const artifacts={};async function walk(dir){for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else artifacts[p]=await hash(p);}}await walk('dist');
 return {commit:(await command('git',['rev-parse','HEAD'],{cwd:root})).trim(),dirty:(await command('git',['status','--porcelain'],{cwd:root})).trim(),inputs,artifacts,artifactHash:createHash('sha256').update(JSON.stringify(artifacts)).digest('hex'),date:new Date().toISOString(),node:process.version};
}
