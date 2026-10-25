// `pnpm test:qualification`: the earlier qualification suites that still pass,
// run in sequence against a fresh production build. CI does not run them; the
// owner's CI journeys and Workers suites are the release wall.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workers = [
  'tests/qualification/core/native.config.ts',
  'tests/qualification/decisions/vitest.config.ts',
  'tests/qualification/journeys/guided-regressions.config.ts',
  'tests/qualification/policies/vitest.config.ts',
  'tests/qualification/refinement/vitest.config.ts',
  'tests/qualification/release-restore-authority/vitest.config.ts',
].map(config => ['node_modules/vitest/vitest.mjs', 'run', '--config', config]);

const nodeTests = [[
  'node_modules/tsx/dist/cli.mjs', '--test', '--test-concurrency=1',
  'tests/qualification/release-shell/native-shell.test.mjs',
]];

// Emitted-Worker and browser journeys read dist/ and choose ports in 8700-8799.
const emitted = [
  'tests/qualification/backend/emitted.mjs',
  'tests/qualification/core/configuration.mjs',
  'tests/qualification/core/discovery-run.mjs',
  'tests/qualification/core/runtime-lifetime.mjs',
  'tests/qualification/data/emitted.mjs',
  'tests/qualification/local/smoke.mjs',
  'tests/qualification/offline-refresh/hook.browser.mjs',
  'tests/qualification/policies/emitted.mjs',
  'tests/qualification/publication/emitted.mjs',
  'tests/qualification/release-search-state/native.mjs',
  'tests/qualification/release-search-state/original.mjs',
  'tests/qualification/search/semantics.mjs',
  'tests/qualification/interface/routed.browser.mjs',
].map(script => [script]);
const navigation = [['tests/qualification/release-navigation-performance/native-journeys.mjs']];
// The core run includes the native identity matrix registered in CONTRACT.md; its shell checks need the flagship sections.
const flagship = [['tests/qualification/core/run.mjs']];

function run(args, env = {}, command = process.execPath) {
  const evidence = mkdtempSync(join(tmpdir(), 'slate-qualification-'));
  try {
    const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, QUAL_EVIDENCE: evidence, QUAL_APP_PORT: '8746', QUAL_INSPECTOR_PORT: '8747', ...env } });
    return result.status === 0;
  } finally { rmSync(evidence, { recursive: true, force: true }); }
}

if (!run(['exec', 'vite', 'build'], {}, 'pnpm')) process.exit(1);
const failed = [];
for (const args of [...workers, ...nodeTests, ...emitted]) if (!run(args)) failed.push(args.at(-1));
for (const args of navigation) if (!run(args, { QUAL_PORT_RANGE: '59800-59819' })) failed.push(args.at(-1));
for (const args of flagship) if (!run(args, { SLATE_PROFILE: 'flagship' })) failed.push(args.at(-1));
if (failed.length) { console.error(`Qualification suites failed:\n${failed.join('\n')}`); process.exit(1); }
console.log('All qualification suites passed.');
