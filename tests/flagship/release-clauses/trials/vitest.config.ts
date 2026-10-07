import path from 'node:path';
import {cloudflareTest,readD1Migrations} from '@cloudflare/vitest-pool-workers';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {resolveVitestWranglerConfigPath} from '../../../e2e/setup/wrangler-config.ts';
const port=Number(process.env.SLATE_TEST_PORT??60620);
export default defineConfig({server:{port,strictPort:true},plugins:[cloudflareTest({miniflare:{port:port+1,inspectorPort:port+2,bindings:{TEST_MIGRATIONS:await readD1Migrations(path.join(process.cwd(),'migrations/core'))}},wrangler:{configPath:resolveVitestWranglerConfigPath(process.cwd(),'flagship')}}),tanstackStart({prerender:{enabled:false}}),react()],test:{include:['tests/flagship/release-clauses/trials/*.test.ts'],setupFiles:['tests/e2e/setup/apply-migrations.ts'],expect:{requireAssertions:true}}});
