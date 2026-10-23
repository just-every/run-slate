import path from 'node:path';
import {cloudflareTest, readD1Migrations} from '@cloudflare/vitest-pool-workers';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {resolveVitestWranglerConfigPath} from '../e2e/setup/wrangler-config.ts';
const migrations = await readD1Migrations(path.join(process.cwd(), 'migrations/core'));
export default defineConfig({
  server: {port: Number(process.env.SLATE_TEST_PORT ?? 55500), strictPort: true},
  plugins: [cloudflareTest({
    miniflare: {port: Number(process.env.SLATE_TEST_PORT ?? 55500) + 1, inspectorPort: Number(process.env.SLATE_TEST_PORT ?? 55500) + 2, bindings: {TEST_MIGRATIONS: migrations}, d1Databases: {FEATURE_PRIOR_DB: 'feature-switch-prior'}},
    wrangler: {configPath: resolveVitestWranglerConfigPath(process.cwd())},
  }), tanstackStart({prerender: {enabled: false}}), react()],
  test: {include: ['tests/profile/*.worker.test.ts'], setupFiles: ['tests/e2e/setup/apply-migrations.ts'], expect: {requireAssertions: true}, testTimeout: 60000},
});
