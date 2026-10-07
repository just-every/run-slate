import path from 'node:path';
import {cloudflareTest,readD1Migrations} from '@cloudflare/vitest-pool-workers';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {resolveVitestWranglerConfigPath} from '../../e2e/setup/wrangler-config.ts';
const port=Number(process.env.SLATE_TEST_PORT??61400);
const migrations=await readD1Migrations(path.join(process.cwd(),'migrations/core'));
export default defineConfig({
  server:{port,strictPort:true},
  plugins:[cloudflareTest({miniflare:{port:port+1,inspectorPort:port+2,d1Databases:{PRIOR_DB:'inquiry-before-admission'},bindings:{TEST_MIGRATIONS:migrations}},wrangler:{configPath:resolveVitestWranglerConfigPath(process.cwd(),'flagship')}}),tanstackStart({prerender:{enabled:false}}),react()],
  test:{include:['tests/qualification/release-integration-repairs/*.test.ts','tests/flagship/release-clauses/inquiry/*.test.ts'],setupFiles:['tests/e2e/setup/apply-migrations.ts'],expect:{requireAssertions:true}},
});
