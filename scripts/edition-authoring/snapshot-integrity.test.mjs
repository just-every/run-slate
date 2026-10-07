import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const implementation = path.dirname(fileURLToPath(import.meta.url));
function run(cwd, command, args) {
  return execFileSync(command, args, {cwd, encoding: 'utf8', stdio: 'pipe'}).trim();
}
function git(cwd, ...args) { return run(cwd, 'git', args); }
function cli(cwd, command) {
  return JSON.parse(run(cwd, process.execPath, ['scripts/edition-authoring/cli.mjs', command]));
}
function author(directory, parent) {
  fs.mkdirSync(directory);
  git(directory, 'init');
  git(directory, 'config', 'user.email', 'fixture@example.invalid');
  git(directory, 'config', 'user.name', 'Authoring integrity test');
  fs.mkdirSync(path.join(directory, 'scripts/edition-authoring'), {recursive: true});
  for (const name of fs.readdirSync(implementation).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))) {
    fs.copyFileSync(path.join(implementation, name), path.join(directory, 'scripts/edition-authoring', name));
  }
  fs.writeFileSync(path.join(directory, 'app.mjs'), 'export const preserved = true;\n');
  fs.writeFileSync(path.join(directory, 'edition.json'), JSON.stringify({
    schemaVersion: 1, id: 'fixture/edition',
    toolchain: {id: 'runeditrun/edition-authoring', version: '1.1.0'},
    parent,
    components: [{id: 'fixture/edition', role: 'edition', source: {kind: 'local', paths: ['app.mjs']}}],
  }));
  git(directory, 'add', '.');
  cli(directory, 'lock');
  git(directory, 'add', '.');
  git(directory, 'commit', '-m', 'Retain authoritative inputs');
  return {repository: directory, revision: git(directory, 'rev-parse', 'HEAD')};
}

test('source checks bind comparison ancestry metadata as well as source files', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'edition-ancestry-integrity-'));
  try {
    const first = author(path.join(temporary, 'first'), null);
    const second = author(path.join(temporary, 'second'), first);
    const last = path.join(temporary, 'last');
    author(last, second);
    const lock = cli(last, 'check');
    const parentPath = path.join(last, '.edition/sources', lock.parent.key + '.json');
    const original = fs.readFileSync(parentPath);
    const parent = JSON.parse(original);
    assert.equal(parent.dependencies.length, 1);
    // Dropping comparison ancestry must not pass merely because parent.files is unchanged.
    fs.writeFileSync(parentPath, JSON.stringify({...parent, dependencies: []}));
    assert.throws(() => cli(last, 'check'), /Stale lock|integrity mismatch/);
    fs.writeFileSync(parentPath, original);
    const ancestorPath = path.join(last, '.edition/sources', parent.dependencies[0].key + '.json');
    const ancestor = JSON.parse(fs.readFileSync(ancestorPath));
    // An ancestor's metadata must also be covered through its parent's retained reference.
    fs.writeFileSync(ancestorPath, JSON.stringify({...ancestor, dependencies: [{key: '0'.repeat(64), digest: '0'.repeat(64)}]}));
    assert.throws(() => cli(last, 'check'), /corrupt ancestor/);
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
});

test('promotion keeps subset origins reconstructible offline and preserves occupied destinations', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'edition-subset-promotion-'));
  try {
    const upstream = path.join(temporary, 'upstream');
    author(upstream, null);
    fs.mkdirSync(path.join(upstream, 'export'));
    fs.writeFileSync(path.join(upstream, 'export/one.mjs'), 'export const one = 1;\n');
    fs.writeFileSync(path.join(upstream, 'export/two.mjs'), 'export const two = 2;\n');
    git(upstream, 'add', '.');
    git(upstream, 'commit', '-m', 'Publish selectable source subset');
    const app = path.join(temporary, 'app');
    author(app, null);
    const recipePath = path.join(app, 'edition.json');
    const recipe = JSON.parse(fs.readFileSync(recipePath));
    recipe.components.push({id: 'fixture/subset', role: 'module', source: {
      kind: 'git', repository: upstream, revision: git(upstream, 'rev-parse', 'HEAD'),
      path: 'export', paths: ['one.mjs', 'two.mjs'], destination: 'selected',
    }});
    fs.writeFileSync(recipePath, JSON.stringify(recipe));
    git(app, 'add', '.');
    cli(app, 'lock');
    fs.renameSync(upstream, upstream + '-unavailable');
    fs.mkdirSync(path.join(app, 'selected'));
    fs.writeFileSync(path.join(app, 'selected/two.mjs'), 'retained untracked owner input\n');
    assert.throws(() => run(app, process.execPath, ['scripts/edition-authoring/cli.mjs', 'promote', 'fixture/subset']), /already exists/);
    assert.equal(fs.existsSync(path.join(app, 'selected/one.mjs')), false);
    assert.equal(fs.readFileSync(path.join(app, 'selected/two.mjs'), 'utf8'), 'retained untracked owner input\n');
    fs.renameSync(path.join(app, 'selected'), path.join(app, 'owner-input'));
    run(app, process.execPath, ['scripts/edition-authoring/cli.mjs', 'promote', 'fixture/subset']);
    const promoted = JSON.parse(fs.readFileSync(recipePath)).components[1];
    assert.deepEqual(promoted.source.origin.paths, ['one.mjs', 'two.mjs']);
    git(app, 'add', '.');
    cli(app, 'lock');
    cli(app, 'check');
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
});
