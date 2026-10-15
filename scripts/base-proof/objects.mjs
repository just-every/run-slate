// A bounded native Git object reader. No source programs or Git configuration run.
import {createHash} from 'node:crypto';
import {inflateSync, deflateSync} from 'node:zlib';

// The approved Base commits, oldest first. Each copy record names one of them; the
// restored repository's HEAD is the newest.
export const PINS = ['1ce15dd8cbb7c8cf2d83ebfde2b4a8a130ff9d74', 'b4b372b032b2ddd7fbf47efa1bf17e1d5235be98'];
export const HEAD = PINS.at(-1);
export const REPOSITORY = 'retained-native-base';
export const objectId = bytes => createHash('sha1').update(bytes).digest('hex');
export function encodeObject(type, data) {
  const bytes = Buffer.concat([Buffer.from(`${type} ${data.length}\0`), data]);
  return {id: objectId(bytes), encoded: deflateSync(bytes).toString('base64')};
}
export function decodeObjects(proof) {
  if (proof?.schemaVersion !== 2 || JSON.stringify(proof.revisions) !== JSON.stringify(PINS) || proof.repository !== REPOSITORY ||
      !proof.objects || Array.isArray(proof.objects) || typeof proof.objects !== 'object') throw Error('Invalid Base proof identity');
  const objects = new Map();
  for (const [id, encoded] of Object.entries(proof.objects)) {
    if (!/^[a-f0-9]{40}$/.test(id) || typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw Error('Invalid Base proof object encoding');
    const bytes = inflateSync(Buffer.from(encoded, 'base64'), {maxOutputLength: 64 * 1024 * 1024});
    if (objectId(bytes) !== id) throw Error(`Base proof object hash mismatch: ${id}`);
    const end = bytes.indexOf(0);
    const header = /^(commit|tree|blob) (0|[1-9][0-9]*)$/.exec(bytes.subarray(0, end).toString('ascii'));
    if (end < 0 || !header || Number(header[2]) !== bytes.length - end - 1) throw Error(`Invalid native Base object: ${id}`);
    objects.set(id, {type: header[1], data: bytes.subarray(end + 1), bytes});
  }
  return objects;
}
// Every approved commit's complete tree: the objects they require, and each commit's files by path.
export function treeInventory(objects) {
  const required = new Set(), files = new Map();
  for (const pin of PINS) {
    const commit = objects.get(pin);
    if (commit?.type !== 'commit') throw Error(`Base proof is missing the pinned commit ${pin}`);
    const root = /^tree ([a-f0-9]{40})\n/.exec(commit.data.toString('utf8'))?.[1];
    if (!root) throw Error('Invalid pinned Base commit tree');
    required.add(pin);
    files.set(pin, new Map());
    visit(objects, root, '', required, files.get(pin));
  }
  return {required, files};
}

function visit(objects, id, prefix, required, files) {
  const object = objects.get(id);
  if (object?.type !== 'tree') throw Error(`Base proof is missing native tree: ${id}`);
  required.add(id);
  let offset = 0;
  while (offset < object.data.length) {
    const space = object.data.indexOf(32, offset), end = object.data.indexOf(0, space + 1);
    if (space < offset || end < space || end + 21 > object.data.length) throw Error('Invalid Base tree entry');
    const mode = object.data.subarray(offset, space).toString('ascii');
    const name = object.data.subarray(space + 1, end).toString('utf8');
    if (!name || name.includes('/') || name === '.' || name === '..') throw Error('Invalid Base tree name');
    const child = object.data.subarray(end + 1, end + 21).toString('hex');
    const pathname = prefix + name;
    if (mode === '40000') visit(objects, child, pathname + '/', required, files);
    else if (mode === '100644' || mode === '100755') files.set(pathname, child);
    else if (mode !== '120000' && mode !== '160000') throw Error('Invalid Base tree mode');
    offset = end + 21;
  }
}
