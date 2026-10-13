import { applyD1Migrations,env } from 'cloudflare:test';
import { test,expect } from 'vitest';
import { searchFixture } from './route-fixture';
import { candidateMatch } from '../../../src/core/features/search/tokens';
import { rebuildSearchIndex } from '../../../src/core/features/search/rebuild';
import { prepareSearchRestoreStatements } from '../../../src/core/features/search/restore-index';
import type { FeatureContext } from '../../../src/core/app/feature-context';

test('Prior-data search upgrade backfills existing text, preserves pending work and rebuilds from canonical content',async()=>{
 const db=(env as unknown as {PRIOR_DB:D1Database}).PRIOR_DB;
 await applyD1Migrations(db,env.TEST_MIGRATIONS.filter(m=>m.name<'0021_search_fts.sql'));
 const f=await searchFixture(db),{sql,page,find,now}=f;
 // A real prior installation with thousands of canonical rows and a populated old index.
 await sql(`WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<2399)
  INSERT INTO pages(id,workspace_id,container_id,page_kind,title,author_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id)
  SELECT printf('prior-%04d',i),'w','c',CASE WHEN i%3=0 THEN 'record' ELSE 'page' END,'Prior bulk '||i,'owner','live','r','r',?,?,'r' FROM n`,now,now);
 await page('unicode','CAFÉ phrase 😀 OR NEAR foo* -bar (baz) title:needle',{title:'UpgradeMarker'});
 await page('nul','prefix\0AfterNulUnique');
 await page('pending','PendingBody',{title:'PendingTitle'});
 await page('archived','ArchivedBody',{lifecycle:'archived'});await sql("UPDATE pages SET archived_at=? WHERE id='archived'",now);
 await page('trashed','TrashedBody');await sql("UPDATE pages SET trashed_at=? WHERE id='trashed'",now);
 await sql(`INSERT INTO search_text(key,variant,workspace_id,kind,id,page_id,title,text,title_fold,text_fold,document_json,container_id,status,lifecycle,archived_at,trashed_at,author_id,updated_at,contributors_json)
  SELECT CASE WHEN page_kind='record' THEN 'record:' ELSE 'page:' END||id,'working',workspace_id,CASE WHEN page_kind='record' THEN 'record' ELSE 'page' END,id,id,title,(COALESCE((SELECT json_extract(content_json,'$.text') FROM page_blocks WHERE page_id=pages.id LIMIT 1),'')||char(10)),lower(title),CASE WHEN id='unicode' THEN 'café phrase 😀 or near foo* -bar (baz) title:needle'||char(10) ELSE lower((COALESCE((SELECT json_extract(content_json,'$.text') FROM page_blocks WHERE page_id=pages.id LIMIT 1),'')||char(10))) END,
  json_object('kind',CASE WHEN page_kind='record' THEN 'record' ELSE 'page' END,'id',id,'pageId',id,'containerId',container_id,'title',title,'text',(COALESCE((SELECT json_extract(content_json,'$.text') FROM page_blocks WHERE page_id=pages.id LIMIT 1),'')||char(10)),'status',NULL,'lifecycle',lifecycle,'archivedAt',archived_at,'trashedAt',trashed_at,'authorId',author_member_id,'updatedAt',updated_at,'revisionId',revision_id,'contributors',json('[]')),
  container_id,status_key,lifecycle,archived_at,trashed_at,author_member_id,updated_at,'[]' FROM pages WHERE id<>'pending'`);
 await sql("DELETE FROM search_dirty WHERE key<>'page:pending'");
 await sql("INSERT INTO saved_searches VALUES('saved','w','reader','Prior saved',?,'r',?,?)",JSON.stringify({query:'UpgradeMarker'}),now,now);
 await sql("INSERT INTO files(id,workspace_id,page_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES('original','w','unicode','imports/original','original.zip','application/zip',3,?)",now);
 await sql("INSERT INTO import_jobs(id,workspace_id,requested_by_member_id,operation_key,source_format,source_file_id,state,report_json,counts_json,created_at,completed_at) VALUES('completed','w','owner','prior-import','notion','original','completed',?, ?,?,?)",JSON.stringify({retained:true}),JSON.stringify({pages:2400}),now,now);
 await sql("INSERT INTO databases(id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES('db','unicode','w',?,?,'r')",now,now);
 await sql("INSERT INTO database_fields(id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES('amount','db','Amount','number','{}',0,?,?,'r')",now,now);
 await sql("INSERT INTO database_records(page_id,database_id,field_values_json,created_at,updated_at) SELECT id,'db','{\"amount\":731}',?,? FROM pages WHERE page_kind='record'",now,now);
 const retained=async()=>Object.fromEntries(await Promise.all(['pages','page_blocks','search_dirty','saved_searches','files','import_jobs','databases','database_fields','database_records'].map(async table=>[table,(await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])));
 const before=await retained();
 await applyD1Migrations(db,env.TEST_MIGRATIONS);
 const upgraded=await retained();
 expect({...upgraded,search_dirty:before.search_dirty}).toEqual(before);
 expect(upgraded.search_dirty).toEqual(expect.arrayContaining(before.search_dirty));
 expect(upgraded.search_dirty.some((r:any)=>r.key==='page:nul')).toBe(true);
 // No route/refresh has run: these postings must come from the additive migration.
 for(const query of ['CAFÉ','phrase','😀','OR','NEAR','foo*','-bar','(baz)','title:needle','é','a']){
  const hits=(await db.prepare('SELECT t.id FROM search_fts f JOIN search_text t ON t.rowid=f.rowid WHERE search_fts MATCH ?').bind(candidateMatch([query.toLocaleLowerCase()])).all<{id:string}>()).results;
  expect(hits.some(r=>r.id==='unicode')).toBe(true);
 }
 const cases:[string,string,Record<string,string>,number][]=[];
 for(const actor of ['owner','reader','guest','denied','expired','revoked'])for(const query of ['UpgradeMarker','CAFÉ','😀','"CAFÉ phrase"'])cases.push([query,actor,{},['owner','reader','guest'].includes(actor)?1:0]);
 cases.push(['AfterNulUnique','reader',{},1],['PendingTitle','reader',{},1],['Prior bulk','reader',{kind:'record'},800],['731','reader',{kind:'record'},800],['ArchivedBody','reader',{},0],['ArchivedBody','reader',{includeArchived:'true'},1],['TrashedBody','reader',{},0],['TrashedBody','reader',{includeTrashed:'true'},1],['UpgradeMarker','reader',{containerId:'c'},1],['UpgradeMarker','reader',{contributorId:'owner'},1],['UpgradeMarker','reader',{updatedFrom:'2099-01-01'},0]);
 const responses=[];
 for(const [q,actor,filters,total]of cases){const r=await find(q,actor,filters);expect(r.status).toBe(200);expect(r.data.total).toBe(total);responses.push({total:r.data.total,items:r.data.items,facets:r.data.facets});}
 for(const actor of ['inactive','removed'])expect((await find('UpgradeMarker',actor)).status).toBe(401);
 const canonical=await retained();
 // Destruction of all derived text with an empty queue must not make rebuild a no-op.
 await sql('DELETE FROM search_text');await sql('DELETE FROM search_dirty');
 const ctx={db,files:env.FILES,jobs:env.JOBS,actor:{id:'owner',workspaceId:'w',role:'owner'},now} as FeatureContext;
 expect(await rebuildSearchIndex(ctx)).toBeGreaterThan(2400);
 for(const [i,[q,actor,filters]]of cases.entries()){
  const r=await find(q,actor,filters);expect(r.status).toBe(200);expect({total:r.data.total,items:r.data.items,facets:r.data.facets}).toEqual(responses[i]);
 }
 // The atomic archive projection uses the same scalar field text as refresh and
 // rebuild. Re-publish these retained rows, then check their public responses.
 await db.batch([
  db.prepare("INSERT INTO search_dirty SELECT CASE WHEN page_kind='record' THEN 'record:' ELSE 'page:' END||id,workspace_id,hex(randomblob(16)) FROM pages WHERE true ON CONFLICT(key) DO UPDATE SET generation=excluded.generation"),
  ...prepareSearchRestoreStatements(db,canonical as Record<string,Record<string,string|number|null>[]>),
 ]);
 for(const [i,[q,actor,filters]]of cases.entries()){
  const r=await find(q,actor,filters);expect(r.status).toBe(200);expect({total:r.data.total,items:r.data.items,facets:r.data.facets}).toEqual(responses[i]);
 }
 expect(await retained()).toEqual(canonical);
 expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
},120_000);
