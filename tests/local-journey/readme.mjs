import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
export async function readmeCommands(root) {
  const document = await readFile(join(root, 'README.md'), 'utf8');
  const local = document.split('## Run it on your computer')[1]?.split('\n## ')[0];
  assert.ok(local, 'README has local instructions');
  const fences = [...local.matchAll(/```(?:sh|bash)\s*\n([\s\S]*?)```/g)].map(m => m[1].trim().split('\n').map(s => s.trim()));
  return fences;
}
export async function assertDistExcludesSecrets(root, secrets) {
  let files = 0;
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await scan(path);
      else { assert.ok(entry.isFile(), 'dist entries are regular files'); files++; const bytes = await readFile(path); for (const secret of secrets) assert.equal(bytes.includes(Buffer.from(secret)), false, 'dist excludes generated credentials'); }
    }
  }
  await scan(join(root, 'dist'));
  assert.ok(files > 0, 'built dist scanned');
}
export function receipts(fences, record = () => {}) {
  const result = fences.flatMap((lines, i) => lines.map((command, j) => ({ fence: i + 1, line: j + 1, command, executions: 0 })));
  return { passed(command) { const row = result.find(r => r.command === command); assert.ok(row); row.executions++; record({ ...row, status: 'passed' }); }, report() { assert.ok(result.every(r => r.executions > 0), 'every documented command executed'); return result; } };
}
