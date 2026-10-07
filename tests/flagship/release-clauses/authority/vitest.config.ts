import path from 'node:path';
import {cloudflareTest,readD1Migrations} from '@cloudflare/vitest-pool-workers';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {resolveVitestWranglerConfigPath} from '../../../e2e/setup/wrangler-config.ts';
const root=process.cwd(),port=Number(process.env.SLATE_TEST_PORT);
if(port<60540||port>60557)throw new Error('Use the allocated authority test ports');
const migrations=await readD1Migrations(path.join(root,'migrations/core'));
export default defineConfig({
 cacheDir:path.join(process.env.XDG_CACHE_HOME??path.join(root,'.vitest'),'authority-'+port),
 server:{port,strictPort:true},
 plugins:[
  cloudflareTest({miniflare:{port:port+1,inspectorPort:port+2,bindings:{TEST_MIGRATIONS:migrations}},wrangler:{configPath:resolveVitestWranglerConfigPath(root,'flagship')}}),
  tanstackStart({prerender:{enabled:false,autoStaticPathsDiscovery:false,crawlLinks:false,failOnError:true}}),react(),
 ],
 test:{include:['tests/flagship/release-clauses/authority/*.test.ts'],setupFiles:['./tests/e2e/setup/apply-migrations.ts'],fileParallelism:false,expect:{requireAssertions:true}},
});
