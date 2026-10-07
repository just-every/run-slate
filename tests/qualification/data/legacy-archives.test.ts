import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {fixture,insert,canary,canaries} from './fixture';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';
test('BASE-DATA-003 erasure invalidates legacy archive bytes and file metadata without active missing blobs',async()=>{
 const {ctx,page,workspaceId,owner}=await fixture(),json=JSON.stringify({personal:canary});
 for(const kind of ['import','export']){
  await env.FILES.put(`legacy-${kind}`,canary);
  await insert('files',{id:`legacy-${kind}`,workspace_id:workspaceId,storage_key:`legacy-${kind}`,original_name:canary,content_type:'application/zip',size_bytes:canary.length,created_at:ctx.now});
 }
 await insert('import_jobs',{id:'legacy-import-job',workspace_id:workspaceId,requested_by_member_id:owner,operation_key:'legacy-import',source_format:'zip',source_file_id:'legacy-import',state:'completed',report_json:json,counts_json:json,created_at:ctx.now});
 await insert('import_mappings',{id:'legacy-mapping',import_job_id:'legacy-import-job',source_kind:'page',source_id:'original-page',target_kind:'page',target_id:page.pageId,created_at:ctx.now});
 await insert('export_jobs',{id:'legacy-export-job',workspace_id:workspaceId,requested_by_member_id:owner,scope_kind:'workspace',format:'zip',state:'completed',report_json:json,counts_json:json,file_id:'legacy-export',created_at:ctx.now});
 expect(await canaries(['files','import_jobs','export_jobs'])).toEqual({files:2,import_jobs:1,export_jobs:1});
 await archivePage(ctx,page.pageId,{operationKey:'legacy-archive-trash',expectedRevisionId:page.revisionId,action:'trash'});
 await permanentDeletePage(ctx,page.pageId,{operationKey:'legacy-archive-erase',confirmedPageIds:[page.pageId]});
 expect(await canaries(['files','import_jobs','export_jobs'])).toEqual({files:0,import_jobs:0,export_jobs:0});
 for(const kind of ['import','export'])expect(await env.FILES.get(`legacy-${kind}`)).toBeNull();
 expect((await env.DB.prepare("SELECT id FROM files WHERE id LIKE 'legacy-%' AND deleted_at IS NULL").all()).results).toEqual([]);
 expect((await env.DB.prepare("SELECT state FROM import_jobs UNION ALL SELECT state FROM export_jobs").all()).results).toEqual([{state:'failed'},{state:'failed'}]);
});
