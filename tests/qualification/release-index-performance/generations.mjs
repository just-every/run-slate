import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {getPlatformProxy} from 'wrangler';
import {observeBinding} from './native-binding.mjs';
import {checkContent} from './content.mjs';
const {values}=parseArgs({options:{config:{type:'string'},'persist-to':{type:'string'},report:{type:'string'}}});
for(const key of ['config','persist-to','report'])assert.ok(values[key],`--${key} required`);
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const directory=await mkdtemp(path.join(tmpdir(),'slate-generations-'));const checks=[];let proxy;
try {
 const entry=directory+'/entry.ts';await writeFile(entry,`export {refreshSearchIndex} from '${process.cwd()}/src/core/features/search/index';export {documents} from '${process.cwd()}/src/core/features/search/documents';export {search} from '${process.cwd()}/src/core/features/search/service';`);
 await build({entryPoints:[entry],outfile:directory+'/index.mjs',bundle:true,platform:'node',format:'esm'});
 const {refreshSearchIndex,documents,search}=await import(directory+'/index.mjs');
 proxy=await getPlatformProxy({configPath:path.resolve(values.config),persist:{path:path.resolve(values['persist-to'],'v3')}});
 const db=proxy.env.DB,now=new Date().toISOString(),prefix=randomUUID();
 const sql=(s,...args)=>db.prepare(s).bind(...args).run();
 const workspace=prefix+'-workspace',other=prefix+'-other',id=prefix+'-page',foreign=prefix+'-foreign';
 const ctx=(binding=db)=>({db:binding,actor:{workspaceId:workspace},now});
 for(const [w,p] of [[workspace,id],[other,foreign]]){
  await sql('INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES(?,?,?,?,?,?)',w,w,'S',now,now,'r');
  await sql('INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',w+'-owner',w,w+'@test.invalid','Owner','O','owner',now,now);
  await sql('INSERT INTO containers(id,workspace_id,name,created_at,updated_at,revision_id) VALUES(?,?,?,?,?,?)',w+'-container',w,w,now,now,'r');
  await sql('INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',p,w,w+'-container','Initial '+p,w+'-owner','live','r','r',now,now,'r');
 }
 await refreshSearchIndex(ctx());
 checks.push(await checkContent({db,workspace,now,refreshSearchIndex,search}));
 const title=async()=> (await db.prepare("SELECT title FROM search_text WHERE key=? AND variant='working'").bind('page:'+id).first())?.title;
 const marker=async()=>await db.prepare('SELECT generation FROM search_dirty WHERE key=?').bind('page:'+id).first();
 const publication=statements=>statements[0].sql.startsWith('DELETE FROM search_text');
 await sql('UPDATE pages SET title=? WHERE id=?','Selected earlier',id);
 let injected=false;
 await refreshSearchIndex(ctx(observeBinding(db,{async beforeBatch(statements){if(publication(statements)&&!injected){injected=true;await sql('UPDATE pages SET title=? WHERE id=?','Newer already published',id);await refreshSearchIndex(ctx());}}})));
 assert.ok(injected);assert.equal(await title(),'Newer already published');assert.equal(await marker(),null);
 checks.push('older selected generation cannot replace a newer committed index publication');
 await sql('UPDATE pages SET title=? WHERE id=?','Selected second',id);
 let published=false,newGeneration;
 await assert.rejects(()=>refreshSearchIndex(ctx(observeBinding(db,{
  async beforeBatch(statements){if(publication(statements)){await sql('UPDATE pages SET title=? WHERE id=?','Newer still dirty',id);newGeneration=(await marker()).generation;}},
  afterBatch(statements){if(publication(statements))published=true;},
  beforeRead(){if(published)throw Error('controlled interruption after stale transaction');},
 }))),/controlled interruption/);
 assert.equal(await title(),'Newer already published');assert.equal((await marker()).generation,newGeneration);
 await refreshSearchIndex(ctx());assert.equal(await title(),'Newer still dirty');assert.equal(await marker(),null);
 checks.push('stale acknowledgment preserves the newer marker across interruption and retry');
 // Abort inside the native publication transaction after its delete has executed.
 await sql('UPDATE pages SET title=? WHERE id=?','Retry survives SQL abort',id);
 await sql(`CREATE TRIGGER test_publication_abort BEFORE INSERT ON search_text WHEN NEW.id='${id}' BEGIN SELECT RAISE(ABORT,'native publication abort'); END`);
 const abortedGeneration=(await marker()).generation;
 await assert.rejects(()=>refreshSearchIndex(ctx()),/native publication abort/);
 assert.equal(await title(),'Newer still dirty');assert.equal((await marker()).generation,abortedGeneration);
 await sql('DROP TRIGGER test_publication_abort');await refreshSearchIndex(ctx());assert.equal(await title(),'Retry survives SQL abort');
 checks.push('native failure rolls back delete, insert and acknowledgment together; retry completes');
 await sql('UPDATE pages SET title=? WHERE id=?','Before kind transition',id);
 injected=false;
 await refreshSearchIndex(ctx(observeBinding(db,{async beforeBatch(statements){if(publication(statements)&&!injected){injected=true;await sql("UPDATE pages SET page_kind='record',title=? WHERE id=?",'Current record',id);}}})));
 assert.equal(await title(),undefined);assert.equal((await db.prepare("SELECT title FROM search_text WHERE key=? AND variant='working'").bind('record:'+id).first()).title,'Current record');
 await sql('UPDATE pages SET title=? WHERE id=?','Before deletion',id);injected=false;
 await refreshSearchIndex(ctx(observeBinding(db,{async beforeBatch(statements){if(publication(statements)&&!injected){injected=true;await sql('UPDATE pages SET deleted_at=? WHERE id=?',now,id);}}})));
 assert.equal(await db.prepare('SELECT 1 FROM search_text WHERE id=?').bind(id).first(),null);
 checks.push('kind changes clear the old key and deletion between selection and publication cannot resurrect it');
 assert.deepEqual(await documents(ctx(),['page:'+foreign,'container:'+other+'-container']),[]);
 assert.equal(await db.prepare('SELECT 1 FROM search_text WHERE workspace_id=?').bind(other).first(),null);
 assert.equal((await db.prepare('SELECT count(*) n FROM search_dirty WHERE workspace_id=?').bind(other).first()).n,2);
 checks.push('scoped canonical reads and refresh preserve workspace isolation and foreign dirty markers');
 await writeFile(values.report,JSON.stringify({checks},null,2));console.log(JSON.stringify({checks}));
} finally {await proxy?.dispose();await rm(directory,{recursive:true,force:true});}
