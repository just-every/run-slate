import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {restoreProof} from './repository.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (process.argv.length !== 2) throw Error('Usage: node scripts/base-proof/verify.mjs');
const proof = JSON.parse(fs.readFileSync(new URL('./pin-objects.json', import.meta.url), 'utf8'));
const record = JSON.parse(fs.readFileSync(path.join(root, 'base-copies.json'), 'utf8'));
const scratch = path.join(root, '.artifacts');
fs.mkdirSync(scratch, {recursive: true});
const temporary = fs.mkdtempSync(path.join(scratch, 'base-proof-'));
try {
  const base = path.join(temporary, 'base.git');
  restoreProof(base, proof, record);
  const result = spawnSync(process.execPath, ['scripts/edition-authoring/cli.mjs', 'verify-base', '--base', base], {
    cwd: root, stdio: 'inherit', env: {...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1'},
  });
  if (result.error) throw result.error;
  if (result.signal) throw Error(`Base verification terminated by ${result.signal}`);
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}
