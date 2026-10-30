import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PINS, decodeObjects, encodeObject} from '../../scripts/base-proof/objects.mjs';
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
    // A declared adaptation has reviewed edition bytes, while its retained
    // native object remains the independently authenticated comparison source.
    for (const copy of record.copies) for (const local of Object.keys(copy.adapted ?? {})) {
      const adaptation = copy.acknowledged[local];
      const bytes = fs.readFileSync(path.join(root, local));
      assert.equal(sha256(bytes), adaptation.sha256, `Adapted fixture drift: ${local}`);
      fs.writeFileSync(path.join(edition, local), bytes, {mode: adaptation.mode === '100755' ? 0o755 : 0o644});
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

test("native Base provenance authenticates exact copies and refuses every forged or missing origin", async () => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: "verify-base accepts exact native origins and refuses modified, forged and unrecorded copies", run: () => {
  const cases = [
    { name: "unchanged CLI checks all three layers against a native Git object repository", run: () => fixture(({base, verify}) => {
  const {status, report} = verify();
  assert.equal(status, 0, JSON.stringify({ drift: report.drift, unrecordedCopies: report.unrecordedCopies }));
  assert.equal(report.ok, true);
  assert.equal(report.origin, 'local Base checkout');
  assert.deepEqual(report.drift, []);
  assert.deepEqual(report.unrecordedCopies, []);
}) },
    { name: "unchanged CLI rejects modified local bytes", run: () => fixture(({edition, verify}) => {
  fs.appendFileSync(path.join(edition, 'CLAUDE.md'), '\nTEST ONLY mutation\n');
  const {status, report} = verify();
  assert.equal(status, 1);
  assert.ok(report.drift.some(row => row.kind === 'modified' && row.path === 'CLAUDE.md'));
}) },
    { name: "unchanged CLI rejects modified acknowledged adaptation bytes", run: () => fixture(({edition, verify}) => {
  for (const copy of record.copies) for (const local of Object.keys(copy.adapted ?? {})) {
    const filename = path.join(edition, local), original = fs.readFileSync(filename);
    fs.appendFileSync(filename, '\nTEST ONLY unacknowledged adaptation\n');
    const {status, report} = verify();
    assert.equal(status, 1);
    assert.ok(report.drift.some(row => row.kind === 'adaptation-modified' && row.path === local));
    fs.writeFileSync(filename, original);
  }
}) },
    { name: "updating both local bytes and the record cannot forge the upstream source", run: () => fixture(({edition, writeRecord, verify}) => {
  const changed = clone(record), filename = path.join(edition, 'CLAUDE.md');
  fs.appendFileSync(filename, '\nTEST ONLY forged record\n');
  changed.copies.find(copy => copy.path === 'CLAUDE.md').files['CLAUDE.md'] = sha256(fs.readFileSync(filename));
  writeRecord(changed);
  const {status, report} = verify();
  assert.equal(status, 1);
  assert.ok(report.drift.some(row => row.kind === 'origin-mismatch' && row.path === 'CLAUDE.md'));
}) },
    { name: "unchanged CLI rejects an unrecorded copy outside recorded directories", run: () => fixture(({edition, verify}) => {
  const copy = record.copies.find(entry => entry.path === 'src/base/runtime/contract-page.ts');
  fs.copyFileSync(path.join(edition, 'src/base/runtime/contract-page.ts'), path.join(edition, 'unrecorded.txt'));
  const {status, report} = verify();
  assert.equal(status, 1);
  assert.ok(report.unrecordedCopies.some(row => row.path === 'unrecorded.txt' && row.revision === copy.revision));
}) }
  ];
  for (const entry of cases) {
    try { entry.run(); }
    catch (cause) { throw new Error(`Case ${entry.name} failed`, { cause }); }
  }
} },
    { name: "native proof authentication refuses forged identities, altered or missing objects and unapproved origins", run: async () => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: 'PIN or repository tampering is rejected independently of the copy hashes', run: () => {
  const changedRecord = clone(record);
  changedRecord.copies[0].revision = '0'.repeat(40);
  assert.throws(() => validateProof(proof, changedRecord), /exact approved Base pin/);
  assert.throws(() => validateProof({...proof, revisions: [...PINS.slice(0, -1), '0'.repeat(40)]}, record), /proof identity/);
  assert.throws(() => validateProof({...proof, repository: 'https://example.test/base.git'}, record), /proof identity/);
} },
    { name: 'commit, tree and blob tampering fails native object authentication', run: () => {
  const objects = decodeObjects(proof);
  for (const type of ['commit', 'tree', 'blob']) {
    const [id, object] = [...objects].find(([, value]) => value.type === type);
    const forged = encodeObject(type, Buffer.concat([object.data, Buffer.from('TEST ONLY')]));
    const changed = clone(proof);
    changed.objects[id] = forged.encoded;
    assert.throws(() => validateProof(changed, record), /object hash mismatch/);
  }
} },
    { name: 'omitting a native tree or approved origin blob fails closed', run: () => {
  const objects = decodeObjects(proof);
  for (const type of ['tree', 'blob']) {
    const [id] = [...objects].find(([, object]) => object.type === type);
    const changed = clone(proof);
    delete changed.objects[id];
    assert.throws(() => validateProof(changed, record), /missing/);
  }
} },
    { name: 'a correctly hashed unrelated object cannot be smuggled into the retained proof', run: () => {
  const changed = clone(proof), extra = encodeObject('blob', Buffer.from('TEST ONLY unrelated content'));
  changed.objects[extra.id] = extra.encoded;
  assert.throws(() => validateProof(changed, record), /unapproved object/);
} },
    { name: 'redirecting a record to an unretained origin cannot authorize its missing bytes', run: () => {
  const changed = clone(record), {objects, files} = validateProof(proof, record);
  const copy = changed.copies.find(entry => entry.path === 'CLAUDE.md');
  const [origin] = [...files.get(copy.revision)].find(([, id]) => !objects.has(id));
  copy.originPath = origin;
  assert.throws(() => validateProof(proof, changed), /missing the recorded origin blob/);
} }
  ];
  for (const scenario of cases) {
    try {  await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
} }
  ];
  for (const scenario of cases) {
    try {  await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
});
