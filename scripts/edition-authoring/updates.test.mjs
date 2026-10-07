import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const tools = path.dirname(fileURLToPath(import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: 'pipe'}).trim();
const cli = (root, ...args) => JSON.parse(execFileSync('node', [path.join(tools, 'cli.mjs'), ...args], {cwd: root, encoding: 'utf8', stdio: 'pipe'}));
function write(root, name, value) { fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); fs.writeFileSync(path.join(root, name), value); }
function init(root) {fs.mkdirSync(root); git(root, 'init'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid');}
function commit(root) {git(root, 'add', '.'); git(root, 'commit', '-m', 'fixture'); return git(root, 'rev-parse', 'HEAD');}
test('changed inputs, explicit mapping comparison, offline extraction and portable receipt', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'author-update-'));
  try {
    const upstream = path.join(temp, 'upstream'), root = path.join(temp, 'edition');
    init(upstream); write(upstream, 'export/send.mjs', 'baseline'); write(upstream, 'export/other.mjs', 'unchanged');
    const revision = commit(upstream);
    init(root); write(root, 'src/owner.mjs', 'owner policy');
    write(root, 'edition.json', JSON.stringify({schemaVersion: 1, id: 'owner/edition', toolchain: {id: 'runeditrun/edition-authoring', version: '1.1.0'}, components: [{id: 'shared/send', role: 'module', source: {kind: 'local', paths: ['src'], origin: {repository: upstream, revision, path: 'export'}, mappings: [{path: 'src/owner.mjs', originPath: 'send.mjs'}]}}]}));
    commit(root); cli(root, 'lock'); commit(root);
    assert.deepEqual(cli(root, 'changes').files, []);
    write(root, 'src/owner.mjs', 'new policy'); fs.chmodSync(path.join(root, 'src/owner.mjs'), 0o755);
    const changed = cli(root, 'changes').files;
    assert.equal(changed[0].path, 'src/owner.mjs'); assert.equal(changed[0].after.executable, true);
    fs.unlinkSync(path.join(root, 'src/owner.mjs'));
    assert.equal(cli(root, 'changes').files[0].change, 'removed');
    git(root, 'checkout', '--', 'src/owner.mjs');
    write(upstream, 'export/send.mjs', 'upstream correction'); commit(upstream);
    const comparison = cli(root, 'compare', 'shared/send', upstream);
    assert.equal(comparison.upstreamChanges.length, 1); assert.equal(comparison.localChanges.length, 1);
    assert.equal(comparison.localChanges[0].path, 'send.mjs');
    write(upstream, 'export/uncommitted', 'uncommitted'); assert.throws(() => cli(root, 'compare', 'shared/send', upstream));
    fs.rmSync(upstream, {recursive: true});
    const extracted = path.join(temp, 'extracted'); cli(root, 'extract', 'shared/send', extracted);
    assert.equal(fs.readFileSync(path.join(extracted, 'send.mjs'), 'utf8'), 'baseline');
    assert.throws(() => cli(root, 'extract', 'shared/send', extracted));
    assert.throws(() => cli(root, 'extract', 'shared/send', path.join(root, 'inside')));
    const published = path.join(temp, 'published'); const receipt = cli(root, 'release', published);
    const clone = path.join(temp, 'clone'); git(temp, 'clone', published, clone);
    assert.equal(cli(clone, 'receipt', receipt.receiptPath).ok, true);
    assert.equal(fs.existsSync(path.join(clone, '.git/edition-release.json')), false);
    const bad = JSON.parse(fs.readFileSync(receipt.receiptPath)); bad.source.tree = '0'.repeat(40);
    write(temp, 'bad.json', JSON.stringify(bad)); assert.throws(() => cli(clone, 'receipt', path.join(temp, 'bad.json')));
    const collision = path.join(temp, 'collision'); write(temp, 'collision.release.json', 'preserve');
    assert.throws(() => cli(root, 'release', collision)); assert.equal(fs.existsSync(collision), false);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'sources.lock.json')));
    const archive = path.join(root, '.edition/sources', lock.components[0].baseline.key + '.json');
    const saved = JSON.parse(fs.readFileSync(archive)); saved.dependencies.push({key: '0'.repeat(64)}); fs.writeFileSync(archive, JSON.stringify(saved));
    assert.throws(() => cli(root, 'extract', 'shared/send', path.join(temp, 'tampered')));
    assert.equal(fs.existsSync(path.join(temp, 'tampered')), false);
  } finally {fs.rmSync(temp, {recursive: true, force: true});}
});
