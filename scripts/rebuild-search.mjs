import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {getPlatformProxy} from 'wrangler';
const require=createRequire(import.meta.url),deps=createRequire(require.resolve('wrangler/package.json'));
const {build}=deps('esbuild');
const {values}=parseArgs({options:{config:{type:'string'},'persist-to':{type:'string'},workspace:{type:'string'}}});
if(!values.config||!values['persist-to']||!values.workspace)throw Error('Usage: node scripts/rebuild-search.mjs --config LOCAL_CONFIG --persist-to LOCAL_STATE --workspace WORKSPACE_ID');
const directory=await mkdtemp(path.join(tmpdir(),'slate-search-rebuild-'));
let proxy;
try {
 const outfile=path.join(directory,'index.mjs');
 await build({entryPoints:['src/core/features/search/index.ts'],outfile,bundle:true,platform:'node',format:'esm',target:'es2022'});
 const {refreshSearchIndex}=await import(pathToFileURL(outfile).href);
 proxy=await getPlatformProxy({configPath:path.resolve(values.config),persist:{path:path.resolve(values['persist-to'],'v3')}});
 const started=performance.now();
 const refreshed=await refreshSearchIndex({db:proxy.env.DB,actor:{workspaceId:values.workspace},now:new Date().toISOString()});
 console.log(JSON.stringify({workspace:values.workspace,refreshed,elapsedMs:performance.now()-started,scope:'local canonical text rebuild; no provider or access cache'}));
} finally {await proxy?.dispose();await rm(directory,{recursive:true,force:true});}
