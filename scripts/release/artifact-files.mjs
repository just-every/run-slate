import {readdir, readFile, lstat, realpath} from 'node:fs/promises';
import {resolve, relative, extname, isAbsolute} from 'node:path';
const privateName = /^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.yarnrc(?:\.yml)?|\.netrc|\.pypirc)$/i;
export async function files(root) {
  const output = [];
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      if (privateName.test(name)) throw Error('Private configuration found in build output');
      const file = resolve(directory, name), stat = await lstat(file);
      if (stat.isDirectory()) await walk(file);
      else if (stat.isFile()) output.push(relative(root, file).replaceAll('\\', '/'));
      else throw Error('Build output contains a link or special file');
    }
  }
  await walk(root); return output;
}
export async function inside(root, name) {
  const full = resolve(root, name), rel = relative(await realpath(root), await realpath(full));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('Build path leaves its output directory');
  return full;
}
export const moduleType = name => {
  const type = {'.js': 'esm', '.mjs': 'esm', '.cjs': 'commonjs', '.wasm': 'compiled-wasm', '.css': 'text', '.txt': 'text', '.html': 'text', '.bin': 'buffer'}[extname(name)];
  if (!type) throw Error(`Unsupported emitted module: ${name}`);
  return type;
};
export const contentType = name => ({'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain', '.xml': 'application/xml', '.pdf': 'application/pdf'}[extname(name)] ?? 'application/octet-stream');
export async function payload(root, name) {
  const bytes = await readFile(await inside(root, name));
  if (bytes.length > 24 * 1024 * 1024) throw Error('Artifact entry exceeds delivery limit');
  return bytes.toString('base64');
}

/** Vite build metadata is not a Worker module; all other unknown formats fail. */
export async function moduleFiles(root) {
  return (await files(root)).filter(name => name !== 'wrangler.json' && name !== '.vite/manifest.json' && !name.endsWith('.map'));
}
/** Honor Vite's emitted literal .assetsignore entries. New glob syntax needs review. */
export async function assetFiles(root) {
  let ignore = '';
  try { ignore = await readFile(resolve(root, '.assetsignore'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const excluded = new Set(['.assetsignore']);
  for (const raw of ignore.split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    if (!/^[a-zA-Z0-9_.-]+$/.test(line)) throw Error('Unsupported emitted asset ignore syntax; review asset selection');
    excluded.add(line);
  }
  return (await files(root)).filter(name => !name.split('/').some(part => excluded.has(part)));
}
