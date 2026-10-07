import {execFileSync} from 'node:child_process';
import {readFile, lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sha256} from './deployment-spec.mjs';
export const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).trim();
export async function sourceIdentity(root) {
  const files = [];
  for (const name of git(root, 'ls-files', '-z').split('\0').filter(Boolean).sort()) {
    const file = resolve(root, name), stat = await lstat(file);
    if (!stat.isFile()) throw Error(`Unsupported tracked source: ${name}`);
    files.push([name, sha256(await readFile(file)), Boolean(stat.mode & 0o111)]);
  }
  return {commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'), sourceSha256: sha256(JSON.stringify(files)), lockSha256: sha256(await readFile(resolve(root, 'sources.lock.json')))};
}
export function requireClean(root) {
  if (git(root, 'status', '--porcelain', '--untracked-files=normal')) throw Error('Artifact/adoption requires committed clean source');
}
export async function outputIdentity(root) {
  const {files} = await import('./artifact-files.mjs');
  const entries = [];
  for (const directory of ['dist/server', 'dist/client']) for (const name of await files(resolve(root, directory))) entries.push([`${directory}/${name}`, sha256(await readFile(resolve(root, directory, name)))]);
  return sha256(JSON.stringify(entries));
}
