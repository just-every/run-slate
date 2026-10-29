import {expect,vi} from 'vitest';
import {env,createUlid,auditFixture} from './audit-support';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';
import {requestHash} from '../../../src/core/app/operations';

/** Real page mutations and the native scheduler commit their receipts and activity together. */
export async function activityCommitProof(f:Awaited<ReturnType<typeof auditFixture>>) {
 const p=await f.page('Atomic activity page');
 const operationKey=createUlid();
 const input={operationKey,expectedRevisionId:p.revisionId,properties:{title:'Committed activity page'}};
 const result=await f.request('PATCH',`/api/pages/${p.id}`,input);expect(result.status).toBe(200);
 expect(await f.request('PATCH',`/api/pages/${p.id}`,input)).toEqual(result);
 const snapshot=async()=>({
  page:await env.DB.prepare('SELECT * FROM pages WHERE id=?').bind(p.id).first(),
  revisions:(await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id').bind(p.id).all()).results,
  receipts:(await env.DB.prepare('SELECT * FROM operation_receipts WHERE target_id=? ORDER BY id').bind(p.id).all()).results,
  activity:(await env.DB.prepare('SELECT * FROM activity_entries WHERE target_id=? ORDER BY id').bind(p.id).all()).results,
 });
 const committed=await snapshot();
 const receipt=committed.receipts.find(row=>row.operation_key===operationKey)!;
 const entries=committed.activity.filter(row=>row.operation_key===operationKey);expect(entries).toHaveLength(1);
 expect(entries[0]).toMatchObject({id:result.data.receipt.activityId,target_kind:'page',target_id:p.id,operation_key:operationKey});
 expect(JSON.parse(String(entries[0].detail_json)).revisionId).toBe(result.data.value.revisionId);
 expect(JSON.parse(String(receipt.response_json)).receipt).toEqual(result.data.receipt);
 expect(committed.page!.revision_id).toBe(result.data.value.revisionId);
 expect(committed.revisions.some(row=>row.id===result.data.value.revisionId&&JSON.parse(String(row.properties_json)).title==='Committed activity page')).toBe(true);
 const before=JSON.stringify(committed),failedKey=createUlid();
 const failedInput={operationKey:failedKey,expectedRevisionId:result.data.value.revisionId,properties:{title:'Must roll back'}};
 // This trigger aborts the actual D1 batch at its final activity insert, after the page and revision writes.
 await env.DB.prepare(`CREATE TRIGGER synthetic_slate_activity_failure BEFORE INSERT ON activity_entries WHEN NEW.operation_key='${failedKey}' BEGIN SELECT RAISE(ABORT,'synthetic-slate-late-failure'); END`).run();
 try {const failed=await f.request('PATCH',`/api/pages/${p.id}`,failedInput);expect(failed.status).toBe(500);}finally{await env.DB.prepare('DROP TRIGGER synthetic_slate_activity_failure').run();}
 expect(JSON.stringify(await snapshot())).toBe(before);
 expect((await f.request('GET',`/api/pages/${p.id}`)).data.page.title).toBe('Committed activity page');
 expect(await env.DB.prepare('SELECT id FROM operation_receipts WHERE operation_key=?').bind(failedKey).first()).toBeNull();
 expect(await env.DB.prepare('SELECT id FROM activity_entries WHERE operation_key=?').bind(failedKey).first()).toBeNull();
 const recovered=await f.request('PATCH',`/api/pages/${p.id}`,failedInput);expect(recovered.status).toBe(200);
 expect(await f.request('PATCH',`/api/pages/${p.id}`,failedInput)).toEqual(recovered);
 expect((await env.DB.prepare('SELECT id FROM activity_entries WHERE operation_key=?').bind(failedKey).all()).results).toHaveLength(1);
 await f.profile({'page.lifecycle.v1':'draft-then-publish'});
 vi.useFakeTimers({toFake:['Date']});
 try {
  const start=Date.now();vi.setSystemTime(start);
  const scheduledPage=await f.page('Scheduled activity page'),scheduleKey=createUlid(),fireAt=new Date(start+3600000).toISOString();
  const scheduled=await f.request('POST',`/api/pages/${scheduledPage.id}/publish`,{operationKey:scheduleKey,expectedRevisionId:scheduledPage.revisionId,publishAt:fireAt});expect(scheduled.status).toBe(200);
  expect((await f.request('GET',`/api/pages/${scheduledPage.id}`,undefined,f.readerId)).status).toBe(404);
  vi.setSystemTime(start+3600001);await runContentJobs(env);await runContentJobs(env);
  const key=`schedule:${await requestHash({operationKey:scheduleKey})}`;
  const rows=(await env.DB.prepare('SELECT * FROM activity_entries WHERE workspace_id=? AND operation_key=?').bind(f.workspaceId,key).all()).results;expect(rows).toHaveLength(1);
  const current=await f.request('GET',`/api/pages/${scheduledPage.id}`);expect(current.status).toBe(200);expect(current.data.page.lifecycle).toBe('live');
  expect(rows[0]).toMatchObject({feature:'pages',action:'pages.publish',target_kind:'page',target_id:scheduledPage.id,actor_member_id:f.ownerId,operation_key:key});
  const timeline=await f.request('GET','/api/activity?limit=100');expect(timeline.status).toBe(200);
  expect(timeline.data.items.find((item:{id:string})=>item.id===rows[0].id)).toMatchObject({feature:'pages',operationKey:key,context:{pageId:scheduledPage.id,revisionId:current.data.workingRevisionId}});
  const retainedReceipt=await env.DB.prepare('SELECT response_json FROM operation_receipts WHERE workspace_id=? AND operation_key=?').bind(f.workspaceId,key).first<{response_json:string}>();
  expect(JSON.parse(retainedReceipt!.response_json).receipt).toMatchObject({activityId:rows[0].id,operationKey:key,revisionId:current.data.workingRevisionId});
 }finally{vi.useRealTimers();}
}
