import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';
import {fixture,insert,canary} from './fixture';
test('BASE-DATA-003 failed R2 cleanup remains pending, visible and retryable without duplicate destructive audit',async()=>{
 const {ctx,workspaceId,page}=await fixture(),key='data-proof/retry-attachment';await env.FILES.put(key,canary);
 await insert('files',{id:'data-retry-file',workspace_id:workspaceId,page_id:page.pageId,storage_key:key,original_name:canary,content_type:'text/plain',size_bytes:canary.length,created_at:ctx.now});
 await archivePage(ctx,page.pageId,{operationKey:'data-retry-trash',expectedRevisionId:page.revisionId,action:'trash'});
 const failureFiles=new Proxy(env.FILES,{get(target,property){if(property==='delete')return async()=>{throw Error('Explicit test-only storage outage');};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 const input={operationKey:'data-retry-delete',confirmedPageIds:[page.pageId]};
 await expect(permanentDeletePage({...ctx,files:failureFiles},page.pageId,input)).rejects.toMatchObject({code:'ERASURE_PENDING'});
 expect(await env.FILES.get(key)).not.toBeNull();expect(await env.DB.prepare("SELECT state,error_code FROM core_job_failures WHERE id='erasure:media'").first()).toEqual({state:'failed',error_code:'ERASURE_STORAGE_PENDING'});
 const resumed=await permanentDeletePage(ctx,page.pageId,input);expect(resumed.value.deletedPageIds).toEqual([page.pageId]);expect(resumed.receipt.activityId).toBeTruthy();expect(await env.FILES.get(key)).toBeNull();
 const replay=await permanentDeletePage(ctx,page.pageId,input);expect(replay).toEqual(resumed);
 expect(await env.DB.prepare("SELECT count(*) n FROM activity_entries WHERE action='archive.permanent-delete' AND target_id=?").bind(page.pageId).first()).toEqual({n:1});
 expect(await env.DB.prepare('SELECT count(*) n FROM content_media_cleanup WHERE storage_key=?').bind(key).first()).toEqual({n:0});
});

test('BASE-DATA-003 permission revocation at the D1 commit boundary rolls back erasure before R2 deletion',async()=>{
 const {ctx,workspaceId,owner,page}=await fixture(),key='data-proof/raced-attachment';await env.FILES.put(key,canary);
 await insert('files',{id:'data-raced-file',workspace_id:workspaceId,page_id:page.pageId,storage_key:key,original_name:canary,content_type:'text/plain',size_bytes:canary.length,created_at:ctx.now});
 await archivePage(ctx,page.pageId,{operationKey:'data-raced-trash',expectedRevisionId:page.revisionId,action:'trash'});
 let raced=false,deleted=0;
 const database=new Proxy(env.DB,{get(target,property){if(property==='batch')return async(statements:D1PreparedStatement[])=>{if(!raced){raced=true;await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(owner).run();}return target.batch(statements);};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 const files=new Proxy(env.FILES,{get(target,property){if(property==='delete')return async(key:string)=>{deleted++;await target.delete(key);};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 const input={operationKey:'data-raced-delete',confirmedPageIds:[page.pageId]};
 await expect(permanentDeletePage({...ctx,db:database,files},page.pageId,input)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 expect(raced).toBe(true);expect(deleted).toBe(0);expect(await env.FILES.get(key)).not.toBeNull();
 expect(await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(page.pageId).first()).toEqual({title:canary,deleted_at:null});
 expect(await env.DB.prepare('SELECT count(*) n FROM content_media_cleanup').first()).toEqual({n:0});
 expect(await env.DB.prepare('SELECT count(*) n FROM operation_receipts WHERE operation_key=?').bind(input.operationKey).first()).toEqual({n:0});
 await env.DB.prepare("UPDATE members SET status='active' WHERE id=?").bind(owner).run();
 expect((await permanentDeletePage(ctx,page.pageId,input)).value.deletedPageIds).toEqual([page.pageId]);expect(await env.FILES.get(key)).toBeNull();
});
