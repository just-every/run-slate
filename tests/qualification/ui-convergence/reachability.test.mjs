import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { inspectUiReachability, importSpecifiers } from '../../../scripts/ui-reachability.mjs';
import { root } from '../../e2e/runtime-harness.mjs';

test('all production TSX modules belong to the live application import graph', async () => {
  const result = await inspectUiReachability(root);
  assert.deepEqual(result.unresolved, [], 'Local runtime imports must resolve.');
  assert.deepEqual(result.unreachable, [], 'Delete obsolete UI or integrate it into a real application consumer.');
});

test('runtime imports include dynamic loading and re-exports, without comment or type keepalives', () => {
  assert.deepEqual(importSpecifiers(`
    // import Ghost from './comment';
    const message = "import('./string')";
    import {} from './empty-import';
    export {} from './empty-export';
    import type { Shape } from './type';
    import { type Shape, value } from './mixed';
    export type { Shape } from './export-type';
    export { value } from './barrel';
    export * from './all';
    const load = () => import('./dynamic');
    const another = () => import(\`./template\`);
  `, 'entry.tsx'), ['./empty-import', './empty-export', './mixed', './barrel', './all', './dynamic', './template']);
});

test('module resolution follows TS extensions, index barrels and configured aliases; orphans fail', async () => {
  const directory = path.join(root, '.artifacts/ui-convergence');
  await mkdir(directory, { recursive: true });
  const scratch = await mkdtemp(path.join(directory, 'graph-'));
  try {
    const files = {
      'tsconfig.json': JSON.stringify({ compilerOptions: { moduleResolution: 'Bundler', module: 'ESNext', baseUrl: '.', paths: { '@ui/*': ['src/ui/*'] } } }),
      'src/routes/index.tsx': "import '@ui/barrel'; const load=()=>import('../ui/dynamic.js');",
      'src/server.ts': "import start from '@tanstack/react-start/server-entry';", 'src/router.tsx': '', 'src/core/app/ext-client.tsx': "const load=()=>import('../../ext/index.client');",
      'src/ext/index.client.tsx': '', 'src/ui/barrel/index.ts': "export { default } from '../leaf';",
      'src/ui/leaf.tsx': 'export default function Leaf() {}', 'src/ui/dynamic.tsx': '',
      'src/ui/orphan.tsx': '',
    };
    for (const [file, source] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(scratch, file)), { recursive: true });
      await writeFile(path.join(scratch, file), source);
    }
    const result = await inspectUiReachability(scratch);
    assert.deepEqual(result.unresolved, []);
    assert.deepEqual(result.unreachable, ['src/ui/orphan.tsx']);
    assert.ok(result.reached.includes('src/router.tsx'));
    assert.ok(result.reached.includes('src/ext/index.client.tsx'));
    assert.ok(result.reached.includes('src/ui/dynamic.tsx'));
    assert.ok(result.reached.includes('src/ui/leaf.tsx'));
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
