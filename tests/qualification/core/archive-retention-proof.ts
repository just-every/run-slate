import {expect} from 'vitest';
import {retentionFixture} from '../archive-retention-fixture';
import {env,createUlid,auditFixture} from './audit-support';
import {captureMail} from '../../e2e/helpers/mail-edge';
import {sessionFor} from '../../e2e/setup/fixtures';

/** Native HTTP writes; storage readback also observes data hidden by trash. */
export async function archiveRetentionProof(f:Awaited<ReturnType<typeof auditFixture>>) {
  const origin=new URL(String(env.APP_URL)).origin;
  const fixture=await retentionFixture({request:f.request,containerId:f.containerId,memberId:f.readerId,
    upload:async(pageId,bytes)=>{
      const form=new FormData();form.set('operationKey',createUlid());form.set('pageId',pageId);
      form.set('file',new File([new Uint8Array(bytes)],'retained.txt',{type:'text/plain'}));
      const response=await f.api.request(`${origin}/api/media`,{method:'POST',headers:{cookie:f.cookies[f.ownerId],origin},body:form},env);
      expect(response.status,await response.clone().text()).toBe(200);
      return (await response.json<any>()).value;
    },
    readFile:async id=>{
      const response=await f.api.request(`${origin}/api/media/${id}`,{headers:{cookie:f.cookies[f.ownerId]}},env);
      expect(response.status).toBe(200);return new Uint8Array(await response.arrayBuffer());
    },
  });
  const {ids,root,database,before,snapshot,read,write}=fixture;
  const body=async(id:string,action:string)=>({operationKey:createUlid(),expectedRevisionId:(await read(`/api/pages/${id}`)).page.revisionId,action,reason:'Retained by explicit archive'});
  const lifecycles=await Promise.all(ids.map(async id=>(await read(`/api/pages/${id}`)).page.lifecycle));
  for(const [label,id,affected] of [['page tree',root.pageId,ids],['database',database.pageId,[database.pageId,fixture.record.pageId]]] as const) {
    expect((await f.request('POST',`/api/archive/${id}`,await body(id,'archive'))).status).toBe(200);
    expect(await snapshot(),`${label} archive keeps populated content`).toEqual(before);
    for(const pageId of affected)expect((await read(`/api/pages/${pageId}`)).page.lifecycle).toBe('archived');
    expect((await f.request('POST',`/api/archive/${id}`,await body(id,'restore'))).status).toBe(200);
    expect(await snapshot(),`${label} restore keeps populated content`).toEqual(before);
    expect(await Promise.all(ids.map(async pageId=>(await read(`/api/pages/${pageId}`)).page.lifecycle))).toEqual(lifecycles);
    console.info(`PROBE ARCH-004 retention: native ${label} archive and restore -> bodies, history, comments, grants, status, definitions, records and bytes unchanged`);
  }
  const container=await read(`/api/containers/${f.containerId}`);
  await write(`/api/containers/${f.containerId}/archive`,{expectedRevisionId:container.revisionId,reason:'Retained space'});
  expect(await snapshot(),'container archive retains the entire populated tree').toEqual(before);
  for(const id of ids)expect((await read(`/api/pages/${id}`)).page.lifecycle).toBe('archived');
  const archivedContainer=await read(`/api/containers/${f.containerId}`);
  await write(`/api/containers/${f.containerId}/archive`,{expectedRevisionId:archivedContainer.revisionId,restore:true});
  expect(await snapshot(),'container restore retains the entire populated tree').toEqual(before);
  expect(await Promise.all(ids.map(async id=>(await read(`/api/pages/${id}`)).page.lifecycle))).toEqual(lifecycles);
  console.info('PROBE ARCH-004 retention: native container archive and restore -> populated tree and uploaded bytes unchanged');

  const marks=ids.map(()=>'?').join(',');
  const stored=async()=>{
    const rows:Record<string,unknown>={};
    for(const [table,column] of [['pages','id'],['page_blocks','page_id'],['page_revisions','page_id'],['comment_threads','page_id'],['page_grants','page_id'],['files','page_id'],['content_archive_locations','page_id'],['activity_entries','target_id'],['operation_receipts','target_id'],['database_records','page_id']] as const)
      rows[table]=(await env.DB.prepare(`SELECT * FROM ${table} WHERE ${column} IN (${marks}) ORDER BY rowid`).bind(...ids).all()).results;
    rows.comments=(await env.DB.prepare(`SELECT * FROM comments WHERE thread_id IN (SELECT id FROM comment_threads WHERE page_id IN (${marks})) ORDER BY rowid`).bind(...ids).all()).results;
    const file=await env.DB.prepare('SELECT storage_key FROM files WHERE id=?').bind(fixture.file.id).first<{storage_key:string}>();
    const bytes=await env.FILES.get(file!.storage_key);
    rows.bytes=bytes?[...new Uint8Array(await bytes.arrayBuffer())]:null;
    return rows;
  };
  const destroy=(confirmedPageIds:string[],actor=f.ownerId)=>f.request('POST',`/api/archive/${root.pageId}/permanent-delete`,{operationKey:createUlid(),confirmedPageIds},actor);
  let retained=await stored();
  expect((await destroy(ids)).data.code).toBe('NOT_TRASHED');
  expect(await stored(),'untrashed deletion is refused unchanged').toEqual(retained);
  await write(`/api/archive/${root.pageId}`,await body(root.pageId,'archive'));
  retained=await stored();
  expect((await destroy(ids)).data.code).toBe('NOT_TRASHED');
  expect(await stored(),'archived content cannot be permanently deleted').toEqual(retained);
  await write(`/api/archive/${root.pageId}`,await body(root.pageId,'restore'));
  await write(`/api/archive/${root.pageId}`,await body(root.pageId,'trash'));
  retained=await stored();
  expect((await f.request('GET',`/api/archive/${root.pageId}/permanent-delete-preview`)).data.items.map((item:any)=>item.id).sort()).toEqual([...ids].sort());
  expect((await destroy([root.pageId])).data.code).toBe('CONFIRM_CASCADE');
  expect(await stored(),'incomplete cascade confirmation changes nothing').toEqual(retained);
  const mail=captureMail();
  const stale=f.cookies[f.ownerId];
  try {
    expect((await destroy(ids,f.readerId)).data.code).toBe('STEP_UP_REQUIRED');
    expect(await stored(),'full access without fresh mailbox proof changes nothing').toEqual(retained);
    f.cookies[f.ownerId]=await sessionFor(f.ownerId);
    expect((await destroy(ids)).data.code).toBe('STEP_UP_REQUIRED');
    expect(await stored(),'owner without fresh proof changes nothing').toEqual(retained);
  } finally {f.cookies[f.ownerId]=stale;mail.restore();}
  // A fresh session without full rights cannot preview or erase the cascade.
  const {seedMember}=await import('../../e2e/setup/fixtures');
  const denied=await seedMember(f.workspaceId,{role:'member',displayName:'Archive outsider',email:['synthetic-slate-61','test.invalid'].join('@')});
  f.cookies[denied.memberId]=await sessionFor(denied.memberId,{freshProof:true});
  expect((await destroy(ids,denied.memberId)).status).toBe(404);
  expect((await f.request('GET',`/api/archive/${root.pageId}/permanent-delete-preview`,undefined,denied.memberId)).status).toBe(404);
  expect(await stored(),'missing full access refuses preview and erasure unchanged').toEqual(retained);
  const key=createUlid(),input={operationKey:key,confirmedPageIds:ids};
  const deleted=await f.request('POST',`/api/archive/${root.pageId}/permanent-delete`,input);
  expect(deleted.status,JSON.stringify(deleted)).toBe(200);
  expect(deleted.data.value.deletedPageIds.sort()).toEqual([...ids].sort());
  const erased=await stored();
  expect(erased.bytes).toBeNull();
  expect(erased.page_blocks).toEqual([]);
  expect(erased.database_records).toEqual([]);
  for(const comment of erased.comments as any[])expect(comment).toMatchObject({body_json:'[]',author_member_id:null});
  for(const id of ids){
    expect((await f.request('GET',`/api/pages/${id}`)).status).toBe(404);
    expect(await env.DB.prepare('SELECT page_id FROM content_tombstones WHERE page_id=?').bind(id).first()).not.toBeNull();
    const revisions=(await env.DB.prepare('SELECT body_json,properties_json FROM page_revisions WHERE page_id=?').bind(id).all()).results;
    expect(revisions.length).toBeGreaterThan(0);
    for(const revision of revisions)expect(revision).toEqual({body_json:'[]',properties_json:'{}'});
  }
  expect((await f.request('POST',`/api/archive/${root.pageId}/permanent-delete`,input)).status).toBe(200);
  expect((await f.request('POST',`/api/archive/${root.pageId}`,{operationKey:createUlid(),expectedRevisionId:root.revisionId,action:'restore'})).status).toBe(404);
  expect(await stored(),'deletion retry and archive restore cannot resurrect content').toEqual(erased);
  console.info('PROBE ARCH-004 confirmation: native delete -> untrashed, archived, incomplete cascade and stale-proof requests refused unchanged; exact fresh-proof cascade erased, replay cannot resurrect');
}
