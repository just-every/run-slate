import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {getPlatformProxy} from 'wrangler';
const {values}=parseArgs({options:{config:{type:'string'},'persist-to':{type:'string'},workspace:{type:'string'},report:{type:'string'}}});
for(const key of ['config','persist-to','workspace','report'])assert.ok(values[key],`--${key} required`);
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const directory=await mkdtemp(path.join(tmpdir(),'slate-keyed-read-'));
const report={samples:[]};let proxy;
try {
 await build({entryPoints:['src/core/features/search/documents.ts'],outfile:directory+'/documents.mjs',bundle:true,platform:'node',format:'esm'});
 const {documents}=await import(pathToFileURL(directory+'/documents.mjs').href);
 proxy=await getPlatformProxy({configPath:path.resolve(values.config),persist:{path:path.resolve(values['persist-to'],'v3')}});
 const db=proxy.env.DB,workspace=values.workspace;
 report.workspacePages=(await db.prepare('SELECT count(*) n FROM pages WHERE workspace_id=? AND deleted_at IS NULL').bind(workspace).first()).n;
 assert.ok(report.workspacePages>=10000,'The native fixture must contain at least 10,000 unrelated pages');
 // Select different portions of actual canonical data, with variable key counts.
 for(const [size,offset] of [[1,0],[37,report.workspacePages>>1],[250,report.workspacePages-250]]){
  const selected=(await db.prepare('SELECT id,page_kind FROM pages WHERE workspace_id=? AND deleted_at IS NULL ORDER BY id LIMIT ? OFFSET ?').bind(workspace,size,offset).all()).results;
  const sample={size,offset};
  const wrapped={prepare(sql){const statement=db.prepare(sql);return {bind(...args){return {async all(){sample.plan=(await db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all()).results;const result=await statement.bind(...args).all();sample.meta=result.meta;return result;}};}};}};
  const rows=await documents({db:wrapped,actor:{workspaceId:workspace},now:new Date().toISOString()},selected.map(r=>`${r.page_kind==='record'?'record':'page'}:${r.id}`));
  assert.deepEqual(rows.map(r=>r.id).sort(),selected.map(r=>r.id).sort());
  report.samples.push(sample);
 }
 await mkdir(path.dirname(values.report),{recursive:true});await writeFile(values.report,JSON.stringify(report,null,2));
 for(const sample of report.samples){
  assert.ok(sample.meta.rows_read<=sample.size*20+50,`${sample.size} requested keys read ${sample.meta.rows_read} rows across ${report.workspacePages} workspace pages`);
  assert.ok(sample.plan.some(r=>/SEARCH p USING (?:COVERING )?INDEX sqlite_autoindex_pages_1 \(id=\?\)/.test(r.detail)),'Canonical page projection must use the native primary key');
 }
 console.log(JSON.stringify(report));
} finally {await proxy?.dispose();await rm(directory,{recursive:true,force:true});}
