import path from 'node:path';
import {cloudflareTest,readD1Migrations} from '@cloudflare/vitest-pool-workers';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {resolveVitestWranglerConfigPath} from '../../e2e/setup/wrangler-config.ts';
import {captureOutbound,readCaptured} from './outbound-boundary.ts';
const root=process.cwd(),migrations=await readD1Migrations(path.join(root,'migrations/core'));
export default defineConfig({plugins:[cloudflareTest({miniflare:{bindings:{TEST_MIGRATIONS:migrations},outboundService:captureOutbound,serviceBindings:{DATA_PROOF_LOG:readCaptured}},wrangler:{configPath:resolveVitestWranglerConfigPath(root)}}),tanstackStart({prerender:{enabled:false,autoStaticPathsDiscovery:false,crawlLinks:false,failOnError:true}}),react()],test:{include:['tests/qualification/data/**/*.test.ts'],exclude:['tests/qualification/data/nullable-migration.test.ts'],setupFiles:['./tests/e2e/setup/apply-migrations.ts'],fileParallelism:false,testTimeout:60000,expect:{requireAssertions:true}}});
