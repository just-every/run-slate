import { lstat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { localPaths } from './settings.mjs';

// Base's localOwner hook: the active native owners in the canonical local D1,
// read before setup changes settings, builds or migrates. Slate keeps owners in
// members, not in Base's operator table.
export async function localOwner(root) {
  let directory = resolve(root, localPaths().persistPath);
  for (const part of ['v3', 'd1', 'miniflare-D1DatabaseObject']) {
    directory = join(directory, part);
    let status;
    try { status = await lstat(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    if (status.isSymbolicLink() || !status.isDirectory()) throw Error('Canonical local state is unsafe. Preserve it and recover its placement before setup.');
  }
  const owners = new Set();
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.sqlite')) continue;
    const db = new DatabaseSync(join(directory, file.name), { readOnly: true });
    try {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='members'").get()) continue;
      for (const { email } of db.prepare("SELECT email FROM members WHERE role='owner' AND status='active'").all()) if (typeof email === 'string') owners.add(email);
    } finally { db.close(); }
  }
  return [...owners];
}
