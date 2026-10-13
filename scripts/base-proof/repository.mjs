import fs from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {validate} from '../edition-authoring/base-copies.mjs';
import {HEAD, PINS, decodeObjects, treeInventory} from './objects.mjs';

// Authenticate every approved commit's complete tree, then admit only the blobs needed by
// copy records, each read at its own commit. All other blob identities remain in native
// trees for unrecordedCopies detection.
export function validateProof(proof, record) {
  validate(record);
  if (!record.copies.length || record.copies.some(copy => !PINS.includes(copy.revision))) throw Error('Base copy record must use an exact approved Base pin');
  const objects = decodeObjects(proof);
  const {required, files} = treeInventory(objects);
  for (const copy of record.copies) for (const local of Object.keys(copy.files)) {
    const origin = copy.originPath + local.slice(copy.path.length);
    const id = files.get(copy.revision).get(origin);
    if (!id || objects.get(id)?.type !== 'blob') throw Error(`Base proof is missing the recorded origin blob: ${origin}`);
    required.add(id);
  }
  for (const id of objects.keys()) if (!required.has(id)) throw Error(`Base proof contains an unapproved object: ${id}`);
  return {objects, files};
}

// A fresh bare object repository, with no remotes, alternates, hooks or lazy fetch.
// Parent commits and unrelated blobs are intentionally absent; verify-base reads
// only the approved commits' full trees and the approved origin blobs.
export function restoreProof(destination, proof, record) {
  const {objects, files} = validateProof(proof, record);
  fs.mkdirSync(destination); // Never overwrite an existing repository.
  fs.mkdirSync(path.join(destination, 'objects'));
  fs.mkdirSync(path.join(destination, 'refs'));
  fs.writeFileSync(path.join(destination, 'HEAD'), HEAD + '\n');
  fs.writeFileSync(path.join(destination, 'config'), '[core]\n\trepositoryformatversion = 0\n\tbare = true\n');
  for (const [id, object] of objects) {
    const directory = path.join(destination, 'objects', id.slice(0, 2));
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, id.slice(2)), deflateSync(object.bytes), {flag: 'wx'});
  }
  return {commits: PINS, objects: objects.size, files: [...files.values()].reduce((sum, tree) => sum + tree.size, 0)};
}
