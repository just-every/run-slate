// Explicit maintainer acquisition; never called by verification or CI.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {PINS, REPOSITORY, encodeObject} from './objects.mjs';
import {validateProof} from './repository.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [base, destination] = process.argv.slice(2);
if (!base || !destination || process.argv.length !== 4) throw Error('Usage: node scripts/base-proof/retain.mjs <Base-checkout> <absent-output.json>');
const git = (...args) => execFileSync('git', ['-C', base, ...args], {maxBuffer: 64 * 1024 * 1024, env: {...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1'}});
if (git('rev-parse', '--show-object-format').toString().trim() !== 'sha1') throw Error('Base proof requires native SHA-1 objects');
for (const pin of PINS) if (git('rev-parse', `${pin}^{commit}`).toString().trim() !== pin) throw Error(`Approved Base pin unavailable: ${pin}`);
const record = JSON.parse(fs.readFileSync(path.join(root, 'base-copies.json'), 'utf8'));
const objects = {};
function retain(type, id) {
  const object = encodeObject(type, git('cat-file', type, id));
  if (object.id !== id) throw Error(`Base native object identity mismatch: ${id}`);
  objects[id] = object.encoded;
}
for (const pin of PINS) {
  retain('commit', pin);
  retain('tree', git('rev-parse', `${pin}^{tree}`).toString().trim());
  for (const entry of git('ls-tree', '-drz', '--full-tree', pin).toString().split('\0').filter(Boolean)) retain('tree', entry.split(' ')[2].split('\t')[0]);
}
for (const copy of record.copies) for (const local of Object.keys(copy.files)) {
  const origin = copy.originPath + local.slice(copy.path.length);
  const id = git('rev-parse', `${copy.revision}:${origin}`).toString().trim();
  if (!Object.hasOwn(objects, id)) retain('blob', id);
}
const proof = {schemaVersion: 2, repository: REPOSITORY, revisions: PINS, objects: Object.fromEntries(Object.entries(objects).sort(([a], [b]) => a.localeCompare(b)))};
const checked = validateProof(proof, record);
fs.writeFileSync(destination, JSON.stringify(proof, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({commits: PINS, objects: checked.objects.size, baseFiles: [...checked.files.values()].map(tree => tree.size)}));
