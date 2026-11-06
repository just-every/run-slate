import {expect} from 'vitest';
import {env,createUlid,auditFixture} from './audit-support';
import {retentionFixture} from '../archive-retention-fixture';

/** One populated native trash journey, with independent place and time readback. */
export async function trashRetentionProof(f:Awaited<ReturnType<typeof auditFixture>>, tree:Awaited<ReturnType<typeof retentionFixture>>, stored:()=>Promise<unknown>) {
  const {root,ids,read,write,inventory,originalInventory}=tree;
  const before=await stored(),revisionId=(await read(`/api/pages/${root.pageId}`)).page.revisionId;
  const archive=await write(`/api/archive/${root.pageId}`,{expectedRevisionId:revisionId,action:'archive',reason:'Prior archive actor'});
  expect(archive.action).toBe('archive');
  const input={operationKey:createUlid(),expectedRevisionId:revisionId,action:'trash',reason:'Explicit member deletion'};
  const deleted=await f.request('POST',`/api/archive/${root.pageId}`,input,f.readerId);
  expect(deleted.status,JSON.stringify(deleted)).toBe(200);
  const {receipt}=deleted.data;
  expect((await f.request('POST',`/api/archive/${root.pageId}`,input,f.readerId)).data).toEqual(deleted.data);
  expect((await f.request('GET','/api/activity?limit=100',undefined,f.readerId)).data.items
    .filter((entry:any)=>entry.operationKey===input.operationKey)).toMatchObject([{id:receipt.activityId,actor:{id:f.readerId}}]);
  const listed=async(actor=f.ownerId)=>{
    const response=await f.request('GET','/api/archive',undefined,actor);
    expect(response.status).toBe(200);
    return response.data.items.filter((item:any)=>ids.includes(item.id)).sort((a:any,b:any)=>a.id.localeCompare(b.id));
  };
  const locations=originalInventory.filter((item:any)=>ids.includes(item.id));
  for(const row of await listed()) {
    const prior=locations.find((item:any)=>item.id===row.id)!;
    expect(row).toMatchObject({actorMemberId:f.readerId,actorDisplayName:'Core reader',occurredAt:receipt.committedAt,
      trashedAt:receipt.committedAt,priorContainerId:f.containerId,priorContainerName:'Core team',
      priorParentId:prior.parentPageId,priorPosition:prior.treePosition,
      priorOrder:originalInventory.filter((item:any)=>item.parentPageId===prior.parentPageId).findIndex((item:any)=>item.id===row.id)+1});
    expect(row.priorParentTitle).toBe(row.id===root.pageId?'Retention parent':row.id===tree.record.pageId?'Retained database':'Retained archive tree');
  }
  expect((await listed()).map((item:any)=>item.id)).toEqual([...ids].sort());
  const readerRows=await listed(f.readerId);
  expect(readerRows.map((item:any)=>item.id)).toEqual([...ids].sort());
  expect(readerRows.find((item:any)=>item.id===root.pageId)).toMatchObject({priorParentTitle:null,priorOrder:1});
  const firstDeletion=await listed();
  expect((await f.request('POST',`/api/archive/${root.pageId}`,{...input,operationKey:createUlid(),reason:'Repeated trash attempt'})).status).toBe(200);
  expect(await listed(),'a later trash operation keeps the original deleting member, time and placement').toEqual(firstDeletion);
  expect(await inventory()).toEqual(originalInventory.filter((item:any)=>!ids.includes(item.id)));
  const locationsBefore=(await env.DB.prepare(`SELECT * FROM content_archive_locations WHERE page_id IN (${ids.map(()=>'?').join(',')}) ORDER BY page_id`).bind(...ids).all()).results;
  expect(locationsBefore.map((item:any)=>item.actor_member_id)).toEqual(ids.map(()=>f.readerId));
  expect(locationsBefore.every((item:any)=>item.action==='trash'&&item.occurred_at===receipt.committedAt)).toBe(true);
  // Age actual natively trashed rows, then execute the same scheduled entry the Worker runs.
  const aged='2001-02-03T04:05:06.000Z';
  for(const id of ids)await env.DB.batch([
    env.DB.prepare('UPDATE pages SET trashed_at=? WHERE id=?').bind(aged,id),
    env.DB.prepare('UPDATE content_archive_locations SET occurred_at=? WHERE page_id=?').bind(aged,id),
  ]);
  const agedState=await stored(),agedRows=await listed();
  const {scheduledJobs}=await import('../../../src/core/app/background');
  await scheduledJobs({...env,SLATE_PROFILE:'core-wiki'});
  await scheduledJobs({...env,SLATE_PROFILE:'core-wiki'});
  expect(await stored(),'repeated native scheduled processing never expires old trash or retained bytes').toEqual(agedState);
  expect(await listed(),'aged trash remains listed with its original metadata').toEqual(agedRows);
  expect(agedRows.every((item:any)=>item.trashedAt===aged&&item.occurredAt===aged)).toBe(true);
  await write(`/api/archive/${root.pageId}`,{expectedRevisionId:revisionId,action:'restore'});
  expect(await listed()).toEqual([]);
  expect(await inventory(),'the entire subtree returns between the same surviving siblings').toEqual(originalInventory);
  expect(await tree.snapshot(),'trash and restore retain populated data').toEqual(tree.before);
  const after=await stored();
  expect((after as any).pages.map(({archived_at,trashed_at,lifecycle,updated_at,...page}:any)=>page))
    .toEqual((before as any).pages.map(({archived_at,trashed_at,lifecycle,updated_at,...page}:any)=>page));
  console.info('PROBE ARCH-005 metadata: native member trash and replay -> exact deleting member and receipt time, complete descendant inventory and prior container, parent and order; unauthorized parent labels withheld');
  console.info('PROBE ARCH-005 retention: actual trash aged to 2001, two native scheduled runs -> no expiry, bodies and bytes retained; native restore -> same populated subtree and sibling order');
}
