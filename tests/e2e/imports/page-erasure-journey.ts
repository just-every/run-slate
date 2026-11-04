import {expect} from 'vitest';
import {env} from 'cloudflare:test';
import {createApi} from '../../../src/core/app/hono';
import {seedWorkspace,seedMember,sessionFor} from '../setup/fixtures';
import {captureMail} from '../helpers/mail-edge';

/** Native page erasure must retire the whole archive, not its surviving pages. */
export async function pageErasureJourney() {
 const mail=captureMail();
 try {
  const {workspaceId}=await seedWorkspace();
  const email=['synthetic-slate-1','example.test'].join('@');
  const owner=await seedMember(workspaceId,{email,displayName:'Synthetic Slate owner',role:'owner',isSetupOwner:true});
  const cookie=await sessionFor(owner.memberId);
  const revoked=await sessionFor(owner.memberId,{revokedAt:new Date().toISOString()});
  const app=createApi(),origin='http://localhost:8787',host='localhost:8787';
  const bindings={...env,APP_URL:origin,LOCAL_DEVELOPMENT:'true',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-slate-2',RER_DEV_KEY:'synthetic-slate-3-'.padEnd(43,'x')};
  const request=(path:string,body?:unknown,token=cookie,method=body===undefined?'GET':'POST')=>app.request(origin+path,{
   method,headers:{host,origin,Cookie:token,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)}),
  },bindings);
  const call=async(path:string,body?:unknown,method?:string)=>{
   const response=await request(path,body,cookie,method),data=await response.json() as any;
   expect(response.status,JSON.stringify(data)).toBe(200);return data;
  };
  const name='notion-workspace-export.zip';
  const bytes=await (await (env as typeof env&{TEST_IMPORT_FIXTURES:Fetcher}).TEST_IMPORT_FIXTURES.fetch(`https://fixtures/${name}`)).arrayBuffer();
  const operationKey=crypto.randomUUID();
  const upload=()=>{const form=new FormData();form.set('file',new File([bytes],name));form.set('format','notion-workspace');form.set('operationKey',operationKey);return form;};
  const staged=await call('/api/imports',upload());
  let job=await call(`/api/imports/${staged.id}/preview`,{});
  expect(job.state).toBe('preview');
  expect(job.report.counts.pages).toBeGreaterThan(1);
  expect(await env.DB.prepare('SELECT count(*) n FROM pages').first('n')).toBe(0);
  const fingerprint=job.report.fingerprint;
  job=await call(`/api/imports/${job.id}/apply`,{fingerprint});
  for(let n=0;job.state!=='completed'&&n<150;n++)job=await call(`/api/imports/${job.id}/resume`,{});
  expect(job.state).toBe('completed');
  const original=await request(`/api/imports/${job.id}/original`);
  expect(original.status).toBe(200);
  expect(new Uint8Array(await original.arrayBuffer())).toEqual(new Uint8Array(bytes));
  const pages=(await env.DB.prepare('SELECT * FROM pages WHERE workspace_id=? ORDER BY id').bind(workspaceId).all<{id:string;revision_id:string;parent_page_id:string|null;page_kind:string}>()).results;
  const erased=pages.find(page=>page.page_kind==='page'&&!pages.some(child=>child.parent_page_id===page.id))!;
  expect(erased).toBeTruthy();
  const siblings=pages.filter(page=>page.id!==erased.id),siblingIds=JSON.stringify(siblings.map(page=>page.id));
  expect(siblings.length).toBeGreaterThan(0);
  const readSiblings=async()=>Promise.all(siblings.map(page=>call(`/api/pages/${page.id}`)));
  const visibleBefore=await readSiblings();
  const nativeSiblings=async()=>Promise.all([
   env.DB.prepare('SELECT * FROM pages WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(siblingIds).all(),
   env.DB.prepare('SELECT * FROM page_blocks WHERE page_id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(siblingIds).all(),
   env.DB.prepare('SELECT * FROM page_revisions WHERE page_id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(siblingIds).all(),
   env.DB.prepare('SELECT * FROM files WHERE page_id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(siblingIds).all(),
  ]).then(results=>results.map(result=>result.results));
  const nativeBefore=await nativeSiblings();
  expect(nativeBefore[1]!.length).toBeGreaterThan(0);
  const media=(await env.DB.prepare('SELECT storage_key FROM files WHERE page_id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL ORDER BY id').bind(siblingIds).all<{storage_key:string}>()).results;
  const readMedia=async()=>Promise.all(media.map(async row=>{const file=await env.FILES.get(row.storage_key);expect(file).not.toBeNull();return new Uint8Array(await file!.arrayBuffer());}));
  const mediaBefore=await readMedia();
  // A pending append has no target mappings yet, but still holds erased content.
  const queuedForm=new FormData();queuedForm.set('file',new File(['synthetic-slate-4'],'synthetic-slate-4.txt'));
  queuedForm.set('format','text');queuedForm.set('operationKey',crypto.randomUUID());queuedForm.set('destinationPageId',erased.id);
  queuedForm.set('expectedRevisionId',erased.revision_id);queuedForm.set('mode','append');
  const queued=await call('/api/imports',queuedForm);
  const affected=[job.id,queued.id],affectedIds=JSON.stringify(affected);
  const keys=(await env.DB.prepare("SELECT archive_key storage_key FROM federation_imports WHERE id IN (SELECT value FROM json_each(?)) UNION SELECT plan_key FROM federation_imports WHERE id IN (SELECT value FROM json_each(?)) AND plan_key IS NOT NULL UNION SELECT storage_key FROM import_objects WHERE import_id IN (SELECT value FROM json_each(?)) AND kind!='media'").bind(affectedIds,affectedIds,affectedIds).all<{storage_key:string}>()).results;
  expect(keys.length).toBeGreaterThan(1);
  for(const key of keys)expect(await env.FILES.head(key.storage_key)).not.toBeNull();
  expect(await env.DB.prepare('SELECT count(*) n FROM ik_jobs WHERE destination=?').bind(job.id).first<number>('n')).toBeGreaterThan(0);
  const kitJobs=JSON.stringify((await env.DB.prepare('SELECT id FROM ik_jobs WHERE destination=?').bind(job.id).all<{id:string}>()).results.map(row=>row.id));
  const custody=async()=>JSON.stringify(await Promise.all(['federation_imports','federation_import_mappings','import_objects','import_native_targets','ik_jobs','ik_d1_erasure_journal'].map(async table=>[table,(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])));
  await call(`/api/archive/${erased.id}`,{operationKey:crypto.randomUUID(),expectedRevisionId:erased.revision_id,action:'trash'});
  const originalInTrash=await request(`/api/imports/${job.id}/original`);
  expect(originalInTrash.status).toBe(200);
  expect(new Uint8Array(await originalInTrash.arrayBuffer())).toEqual(new Uint8Array(bytes));
  const before=await custody(),erasure={operationKey:crypto.randomUUID(),confirmedPageIds:[erased.id]};
  expect((await request(`/api/archive/${erased.id}/permanent-delete`,erasure,revoked)).status).toBe(401);
  expect(await custody()).toBe(before);
  const unconfirmed=await request(`/api/archive/${erased.id}/permanent-delete`,erasure);
  expect(unconfirmed.status).toBe(403);expect(await unconfirmed.json()).toMatchObject({code:'STEP_UP_REQUIRED'});
  expect(await custody()).toBe(before);
  const link=mail.latestLink(email);
  const confirmed=await app.request(origin+'/auth/confirm',{method:'POST',headers:{host,origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:link.searchParams.get('token')!})},bindings);
  expect(confirmed.status).toBe(303);
  const wrongCascade=await request(`/api/archive/${erased.id}/permanent-delete`,{operationKey:crypto.randomUUID(),confirmedPageIds:[]});
  expect(wrongCascade.status).toBe(409);expect(await wrongCascade.json()).toMatchObject({code:'CONFIRM_CASCADE'});
  expect(await custody()).toBe(before);
  const deleted=await call(`/api/archive/${erased.id}/permanent-delete`,erasure);
  expect(deleted.value.deletedPageIds).toEqual([erased.id]);
  expect((await call(`/api/archive/${erased.id}/permanent-delete`,erasure)).value).toEqual(deleted.value);
  expect((await request(`/api/pages/${erased.id}`)).status).toBe(404);
  const retired=await custody();
  for(const id of affected){
   const retained=await call(`/api/imports/${id}`);
   expect(retained).toMatchObject({state:'deleted',report:{failure:'IMPORT_SOURCE_ERASED'}});
   expect(retained.report.message).toMatch(/erased/i);
   for(const verb of ['retry','resume','Undo'])expect(retained.report.message).toContain(verb);
   expect((await request(`/api/imports/${id}/original`)).status).toBe(404);
   for(const action of ['run','preview','apply','resume','undo']){
    const response=await request(`/api/imports/${id}/${action}`,{fingerprint});
    expect(response.status,action).toBe(409);expect(await response.json()).toMatchObject({code:'IMPORT_SOURCE_ERASED',message:expect.stringMatching(/erased/i)});
   }
   for(const table of ['import_objects','import_native_targets'])expect(await env.DB.prepare(`SELECT count(*) n FROM ${table} WHERE import_id=?`).bind(id).first('n')).toBe(0);
   const revisions=(await env.DB.prepare("SELECT content_json,content_hash,author_member_id FROM core_entity_revisions WHERE entity_kind='import' AND entity_id=?").bind(id).all()).results;
   expect(revisions.length).toBeGreaterThan(0);
   for(const revision of revisions)expect(revision).toEqual({content_json:'{}',content_hash:'',author_member_id:null});
  }
  // Replay the initial capture as well as every recovery action: no resurrection.
  expect(await call('/api/imports',upload())).toMatchObject({id:job.id,state:'deleted'});
  expect((await call('/api/imports/recover',{})).recovered).toBe(true);
  expect(await custody()).toBe(retired);
  for(const key of keys)expect(await env.FILES.head(key.storage_key)).toBeNull();
  for(const table of ['ik_jobs','ik_d1_streams','ik_d1_staging','ik_d1_native_staging','ik_d1_preparation_steps']){
   expect(await env.DB.prepare(`SELECT count(*) n FROM ${table} WHERE destination IN (SELECT value FROM json_each(?))`).bind(affectedIds).first('n'),table).toBe(0);
  }
  for(const table of ['ik_d1_stream_pages','ik_d1_plan_index','ik_d1_indexed_jobs','ik_d1_entries','ik_d1_history','ik_provenance','ik_sources','ik_stages','ik_batches','ik_d1_original_chunks','ik_originals','ik_original_sets','ik_d1_plan_chunks','ik_d1_reversal_reports','ik_d1_creation_plans']){
   expect(await env.DB.prepare(`SELECT count(*) n FROM ${table} WHERE job_id IN (SELECT value FROM json_each(?))`).bind(kitJobs).first('n'),table).toBe(0);
  }
  const anchors=(await env.DB.prepare('SELECT namespace,operation_key FROM ik_d1_stream_revisions WHERE destination=?').bind(job.id).all()).results;
  expect(anchors.length).toBeGreaterThan(0);
  for(const anchor of anchors)expect(anchor).toEqual({namespace:'',operation_key:''});
  expect(await env.DB.prepare('SELECT count(*) n FROM ik_d1_erasure_journal WHERE destination=?').bind(job.id).first('n')).toBe(1);
  expect((await env.DB.prepare('SELECT * FROM content_media_cleanup').all()).results).toEqual([]);
  expect(await readSiblings()).toEqual(visibleBefore);
  expect(await nativeSiblings()).toEqual(nativeBefore);
  expect(await readMedia()).toEqual(mediaBefore);
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
 } finally {mail.restore();}
}
