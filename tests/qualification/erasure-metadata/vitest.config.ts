import path from 'node:path';
import {cloudflareTest, readD1Migrations} from '@cloudflare/vitest-pool-workers';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {resolveVitestWranglerConfigPath} from '../../e2e/setup/wrangler-config.ts';

const root = process.cwd();
const migrations = await readD1Migrations(path.join(root, 'migrations/core'));
const port = Number(process.env.SLATE_TEST_PORT ?? 55900);
export default defineConfig({
  server: {port, strictPort: true},
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {TEST_MIGRATIONS: migrations},
        d1Databases: ['Q11_RESTORE_DB'],
        r2Buckets: ['Q11_RESTORE_FILES'],
      },
      wrangler: {configPath: resolveVitestWranglerConfigPath(root)},
    }),
    tanstackStart({prerender: {enabled: false, autoStaticPathsDiscovery: false, crawlLinks: false, failOnError: true}}),
    react(),
  ],
  test: {
    include: ['tests/qualification/erasure-metadata/*.test.ts'],
    setupFiles: ['./tests/e2e/setup/apply-migrations.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    expect: {requireAssertions: true},
  },
});
