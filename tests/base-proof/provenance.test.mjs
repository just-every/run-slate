import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {HEAD, PINS, decodeObjects, encodeObject} from '../../scripts/base-proof/objects.mjs';
import {restoreProof, validateProof} from '../../scripts/base-proof/repository.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const proof = JSON.parse(fs.readFileSync(path.join(root, 'scripts/base-proof/pin-objects.json')));
const record = JSON.parse(fs.readFileSync(path.join(root, 'base-copies.json')));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const environment = {...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1'};
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], {env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

function fixture(run) {
  const scratch = path.join(root, '.artifacts');
  fs.mkdirSync(scratch, {recursive: true});
  const directory = fs.mkdtempSync(path.join(scratch, 'base-proof-test-'));
  try {
    const edition = path.join(directory, 'edition'), base = path.join(directory, 'base.git');
    fs.mkdirSync(edition);
    git(edition, 'init', '--quiet');
    const {objects, files} = validateProof(proof, record);
    for (const copy of record.copies) for (const local of Object.keys(copy.files)) {
      const filename = path.join(edition, local);
      const origin = copy.originPath + local.slice(copy.path.length);
      fs.mkdirSync(path.dirname(filename), {recursive: true});
      fs.writeFileSync(filename, objects.get(files.get(copy.revision).get(origin)).data, { mode: copy.modes?.[local] === '100755' ? 0o755 : 0o644 });
    }
    const writeRecord = value => fs.writeFileSync(path.join(edition, 'base-copies.json'), JSON.stringify(value));
    writeRecord(record);
    restoreProof(base, proof, record);
    const verify = () => {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/edition-authoring/cli.mjs'), 'verify-base', '--base', base], {cwd: edition, env: environment, encoding: 'utf8'});
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      return {status: result.status, report: JSON.parse(result.stdout)};
    };
    run({edition, base, writeRecord, verify});
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('native retained proof authenticates the exact pins and retains only approved blob bodies', () => {
  const {objects, files} = validateProof(proof, record);
  for (const pin of PINS) assert.equal(objects.get(pin).type, 'commit');
  assert.ok(files.get(HEAD).size > Object.values(record.copies).reduce((sum, copy) => sum + Object.keys(copy.files).length, 0));
  const approved = new Set(record.copies.flatMap(copy => Object.keys(copy.files).map(local => files.get(copy.revision).get(copy.originPath + local.slice(copy.path.length)))));
  assert.deepEqual(new Set([...objects].filter(([, object]) => object.type === 'blob').map(([id]) => id)), approved);
  assert.ok([...files.get(HEAD).values()].some(id => !objects.has(id)), 'unrelated blob bodies must be omitted');
});

test('unchanged CLI checks all three layers against a native Git object repository', () => fixture(({base, verify}) => {
  assert.equal(git(base, 'rev-parse', 'HEAD'), HEAD);
  const {files} = validateProof(proof, record);
  for (const pin of PINS) {
    const native = git(base, 'ls-tree', '-r', '--full-tree', pin).split('\n').filter(line => /^(100644|100755) blob /.test(line));
    assert.equal(native.length, files.get(pin).size, 'native tree enumeration must include omitted blob identities');
  }
  const {status, report} = verify();
  assert.equal(status, 0, JSON.stringify({ drift: report.drift, unrecordedCopies: report.unrecordedCopies }));
  assert.equal(report.ok, true);
  assert.equal(report.origin, 'local Base checkout');
  assert.deepEqual(report.drift, []);
  assert.deepEqual(report.unrecordedCopies, []);
}));

test('unchanged CLI rejects modified local bytes', () => fixture(({edition, verify}) => {
  fs.appendFileSync(path.join(edition, 'CLAUDE.md'), '\nTEST ONLY mutation\n');
  const {status, report} = verify();
  assert.equal(status, 1);
  assert.ok(report.drift.some(row => row.kind === 'modified' && row.path === 'CLAUDE.md'));
}));

test('updating both local bytes and the record cannot forge the upstream source', () => fixture(({edition, writeRecord, verify}) => {
  const changed = clone(record), filename = path.join(edition, 'CLAUDE.md');
  fs.appendFileSync(filename, '\nTEST ONLY forged record\n');
  changed.copies.find(copy => copy.path === 'CLAUDE.md').files['CLAUDE.md'] = sha256(fs.readFileSync(filename));
  writeRecord(changed);
  const {status, report} = verify();
  assert.equal(status, 1);
  assert.ok(report.drift.some(row => row.kind === 'origin-mismatch' && row.path === 'CLAUDE.md'));
}));

test('unchanged CLI rejects an unrecorded copy outside recorded directories', () => fixture(({edition, verify}) => {
  const copy = record.copies.find(entry => entry.path === 'src/base/runtime');
  fs.copyFileSync(path.join(edition, 'src/base/runtime/lobby.ts'), path.join(edition, 'unrecorded.txt'));
  const {status, report} = verify();
  assert.equal(status, 1);
  assert.ok(report.unrecordedCopies.some(row => row.path === 'unrecorded.txt' && row.revision === copy.revision));
}));

test('PIN or repository tampering is rejected independently of the copy hashes', () => {
  const changedRecord = clone(record);
  changedRecord.copies[0].revision = '0'.repeat(40);
  assert.throws(() => validateProof(proof, changedRecord), /exact approved Base pin/);
  assert.throws(() => validateProof({...proof, revisions: [...PINS.slice(0, -1), '0'.repeat(40)]}, record), /proof identity/);
  assert.throws(() => validateProof({...proof, repository: 'https://example.test/base.git'}, record), /proof identity/);
});

test('commit, tree and blob tampering fails native object authentication', () => {
  const objects = decodeObjects(proof);
  for (const type of ['commit', 'tree', 'blob']) {
    const [id, object] = [...objects].find(([, value]) => value.type === type);
    const forged = encodeObject(type, Buffer.concat([object.data, Buffer.from('TEST ONLY')]));
    const changed = clone(proof);
    changed.objects[id] = forged.encoded;
    assert.throws(() => validateProof(changed, record), /object hash mismatch/);
  }
});

test('omitting a native tree or approved origin blob fails closed', () => {
  const objects = decodeObjects(proof);
  for (const type of ['tree', 'blob']) {
    const [id] = [...objects].find(([, object]) => object.type === type);
    const changed = clone(proof);
    delete changed.objects[id];
    assert.throws(() => validateProof(changed, record), /missing/);
  }
});

test('a correctly hashed unrelated object cannot be smuggled into the retained proof', () => {
  const changed = clone(proof), extra = encodeObject('blob', Buffer.from('TEST ONLY unrelated content'));
  changed.objects[extra.id] = extra.encoded;
  assert.throws(() => validateProof(changed, record), /unapproved object/);
});

test('redirecting a record to an unretained origin cannot authorize its missing bytes', () => {
  const changed = clone(record), {objects, files} = validateProof(proof, record);
  const copy = changed.copies.find(entry => entry.path === 'CLAUDE.md');
  const [origin] = [...files.get(copy.revision)].find(([, id]) => !objects.has(id));
  copy.originPath = origin;
  assert.throws(() => validateProof(proof, changed), /missing the recorded origin blob/);
});
