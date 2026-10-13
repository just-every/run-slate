import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document} from '../authority/fixture';
import {startImport,runImport,readImport} from '../../../src/core/features/imports/jobs';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';
import {exportWorkspace} from '../../../src/core/features/portability/service';
import {decodeArchive} from '../../../src/core/features/portability/archive';
import {portableTables} from '../../../src/core/features/portability/tables';
beforeEach(reset);
test.each([false,true])('append originals follow historical destination custody and cleanup is truthful (storage failure=%s)',async(failCleanup)=>{
 const f=await fixture(),ctx=f.context(),page=await document(f,'Original retained page'),copy=await document(f,'Original retained page');
 const appended=[];
 for(let n=0;n<2;n++){
  const expectedRevisionId=await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(page.id).first<string>('revision_id');
  const job=await startImport(ctx,{operationKey:`append-${n}`,format:'text',source:{name:`append-${n}.txt`,bytes:new TextEncoder().encode(`Private appended payload ${n}`)},destination:{pageId:page.id,expectedRevisionId:expectedRevisionId!,mode:'append'}});
  await runImport(ctx,job.id);appended.push(await readImport(ctx,job.id));
 }
 expect((await env.DB.prepare('SELECT * FROM federation_import_mappings WHERE import_job_id IN (?,?)').bind(...appended.map(j=>j.id)).all()).results).toEqual([]);
 const original=await env.DB.prepare('SELECT i.archive_key FROM federation_imports i JOIN federation_import_mappings m ON m.import_job_id=i.id WHERE m.target_id=?').bind(page.id).first<string>('archive_key');
 const unrelated=await env.DB.prepare('SELECT i.archive_key FROM federation_imports i JOIN federation_import_mappings m ON m.import_job_id=i.id WHERE m.target_id=?').bind(copy.id).first<string>('archive_key');
 const revision=await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(page.id).first<string>('revision_id');
 await archivePage(ctx,page.id,{operationKey:'append-trash',expectedRevisionId:revision!,action:'trash'});
 const input={operationKey:'append-erase',confirmedPageIds:[page.id]};
 if(failCleanup){
  // Controlled R2 failure after the real D1 erasure commits.
  const files=new Proxy(ctx.files,{get(target,key){if(key==='delete')return async()=>{throw new Error('controlled storage outage');};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await expect(permanentDeletePage({...ctx,files},page.id,input)).rejects.toMatchObject({code:'ERASURE_PENDING'});
  expect((await env.DB.prepare('SELECT count(*) n FROM content_media_cleanup').first<{n:number}>())!.n).toBeGreaterThan(0);
  for(const job of appended)expect(await env.FILES.head(job.archive_key)).not.toBeNull();
 }
 const deleted=await permanentDeletePage(ctx,page.id,input);expect(deleted.value.deletedPageIds).toEqual([page.id]);
 expect((await permanentDeletePage(ctx,page.id,input)).value).toEqual(deleted.value);
 for(const key of [original!,...appended.map(j=>j.archive_key)])expect(await env.FILES.head(key)).toBeNull();
 for(const job of appended)expect((await readImport(ctx,job.id)).state).toBe('deleted');
 expect(await env.FILES.head(unrelated!)).not.toBeNull();
 expect(await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(copy.id).first()).toEqual({title:'Original retained page',deleted_at:null});
 const exported=await exportWorkspace(ctx),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key');
 const {manifest,entries}=await decodeArchive(new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer()));
 expect(Object.keys(manifest.tables).sort()).toEqual([...portableTables].sort());
 expect(manifest.blobs.map(b=>b.key)).toContain(unrelated);
 for(const job of appended)expect(manifest.blobs.map(b=>b.key)).not.toContain(job.archive_key);
 expect(Object.values(entries).map(v=>new TextDecoder().decode(v)).join('')).not.toContain('Private appended payload');
 expect((await env.DB.prepare('SELECT * FROM content_media_cleanup').all()).results).toEqual([]);
});
