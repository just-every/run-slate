import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../', import.meta.url);
test('binding check rejects stale declarations without overwriting them', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-binding-check-'));
  try {
    await fs.mkdir(path.join(directory, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(directory, 'node_modules/wrangler/bin'), { recursive: true });
    await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    await fs.copyFile(new URL('scripts/cf-typegen.mjs', root), path.join(directory, 'scripts/cf-typegen.mjs'));
    // Test-only generator isolates stale checking from the installed Wrangler runtime.
    await fs.writeFile(path.join(directory, 'node_modules/wrangler/bin/wrangler.js'), `
      import fs from 'node:fs';
      const output = process.argv[3];
      fs.writeFileSync(output, '// generated '+output+'\\ninterface SlateWorkerBindings { DB: D1Database; }\\n');
    `);
    const run = (...args) => spawnSync(process.execPath, ['scripts/cf-typegen.mjs', ...args], { cwd: directory, encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
    const target = path.join(directory, 'worker-configuration.d.ts');
    await fs.appendFile(target, 'interface UnexpectedBinding {}\n');
    const stale = await fs.readFile(target, 'utf8');
    const result = run('--check');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Stale worker-configuration\.d\.ts/);
    assert.equal(await fs.readFile(target, 'utf8'), stale);
    assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.worker-configuration-')), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('the app and compiler consume generated bindings', async () => {
  const types = await fs.readFile(new URL('src/core/app/types.ts', root), 'utf8');
  const config = JSON.parse(await fs.readFile(new URL('tsconfig.json', root), 'utf8'));
  assert.match(types, /AppBindings\s*=.*SlateWorkerBindings/);
  assert.ok(config.include.includes('worker-configuration.d.ts'));
});
