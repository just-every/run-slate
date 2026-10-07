import path from 'node:path';
import {cloudflareTest,readD1Migrations} from '@cloudflare/vitest-pool-workers';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {resolveVitestWranglerConfigPath} from '../../e2e/setup/wrangler-config.ts';
const root=process.cwd(),migrations=await readD1Migrations(path.join(root,'migrations/core'));
export default defineConfig({plugins:[cloudflareTest({miniflare:{bindings:{TEST_MIGRATIONS:migrations.filter(m=>!m.name.startsWith('0015_')),TEST_UPGRADE:migrations.filter(m=>m.name.startsWith('0015_'))},outboundService:()=>new Response('Network disabled',{status:503})},wrangler:{configPath:resolveVitestWranglerConfigPath(root)}}),tanstackStart({prerender:{enabled:false,autoStaticPathsDiscovery:false,crawlLinks:false,failOnError:true}}),react()],test:{include:['tests/qualification/data/nullable-migration.test.ts'],setupFiles:['./tests/e2e/setup/apply-migrations.ts'],expect:{requireAssertions:true}}});
