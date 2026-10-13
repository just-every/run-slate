import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256 } from '../../src/index.ts';
export async function verifyLilySource(root:string) {
 const manifest=JSON.parse(await readFile(new URL('./source-manifest.json',import.meta.url),'utf8'));
 for(const file of manifest.files)if(sha256(await readFile(resolve(root,file.path)))!==file.sha256)throw new Error(`Pinned Lily source mismatch: ${file.path}`);
 for(const [name,version] of [['wrangler','4.129.1'],['vite','8.2.2']]) {
  const installed=JSON.parse(await readFile(resolve(root,'node_modules',name,'package.json'),'utf8'));
  if(installed.version!==version)throw new Error(`Pinned Lily runtime prerequisite: ${name}@${version}`);
 }
 return manifest;
}
