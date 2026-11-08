import {expect} from 'vitest';
import {env,createUlid,auditFixture} from './audit-support';
import {captureMail} from '../../e2e/helpers/mail-edge';
import {sessionFor,seedMember} from '../../e2e/setup/fixtures';

/** Existing audit registration: real native requests, independent D1 and R2 readback. */
export async function pageErasureProof(f:Awaited<ReturnType<typeof auditFixture>>) {
  await f.profile({'page.lifecycle.v1':'always-live'});
  f.cookies[f.readerId]=await sessionFor(f.readerId,{freshProof:true});
  const origin=new URL(String(env.APP_URL)).origin;
  const request=(method:string,path:string,body?:unknown)=>f.request(method,path,body,f.readerId);
  const write=async(method:string,path:string,body:Record<string,unknown>)=>{
    const result=await f.request(method,path,{operationKey:createUlid(),...body});
    expect(result.status,JSON.stringify(result)).toBe(200);return result.data;
  };
  const paragraph=(text:string)=>({id:createUlid(),blockType:'paragraph',treePosition:'1',content:{text:[{text}]}});
  const grant=async(id:string,level='full')=>write('POST','/api/sharing',{targetKind:'page',targetId:id,principalKind:'member',principalId:f.readerId,level});
  const create=async(label:string,parentPageId?:string)=>{
    const result=await write('POST','/api/pages',{containerId:f.containerId,parentPageId,title:label,blocks:[paragraph(label+' historical body')]});
    const id=result.value.pageId;
    await write('PUT',`/api/pages/${id}/blocks`,{expectedRevisionId:result.value.revisionId,blocks:[paragraph(label+' current body')]});
    await write('POST',`/api/comments/page/${id}`,{body:[{text:label+' comment'}]});
    const doc=await f.request('GET',`/api/pages/${id}`);
    await write('POST',`/api/pages/${id}/open`,{revisionId:doc.data.workingRevisionId});
    const keys:string[]=[];
    for(const suffix of ['first','second']){
      const form=new FormData();form.set('operationKey',createUlid());form.set('pageId',id);
      form.set('file',new File([label+' '+suffix+' original bytes'],suffix+'.txt',{type:'text/plain'}));
      const response=await f.api.request(origin+'/api/media',{method:'POST',headers:{cookie:f.cookies[f.ownerId],origin},body:form},env);
      expect(response.status).toBe(200);
      const file=await response.json<any>();
      keys.push((await env.DB.prepare('SELECT storage_key FROM files WHERE id=?').bind(file.value.id).first<{storage_key:string}>())!.storage_key);
    }
    return {id,keys,revision:result.value.revisionId,label};
  };
  const trash=async(id:string,action='trash')=>write('POST',`/api/archive/${id}`,{expectedRevisionId:await f.revision(id),action});
  const outside=await create('synthetic-slate-outside'),editOnly=await create('synthetic-slate-edit-only'),hidden=await create('synthetic-slate-hidden');
  await grant(editOnly.id,'edit');await trash(editOnly.id);await trash(hidden.id);
  const outsider=await seedMember(f.workspaceId,{role:'member',displayName:'Erase editor',email:['synthetic-slate-editor','test.invalid'].join('@')});
  f.cookies[outsider.memberId]=await sessionFor(outsider.memberId,{freshProof:true});
  const inventory=async(ids:string[])=>{
    const json=JSON.stringify(ids),rows:Record<string,any>={};
    for(const [table,column] of [['pages','id'],['page_blocks','page_id'],['page_revisions','page_id'],['files','page_id'],['page_views','page_id'],['comment_threads','page_id'],['activity_entries','target_id'],['operation_receipts','target_id'],['content_tombstones','page_id']] as const)
      rows[table]=(await env.DB.prepare(`SELECT * FROM ${table} WHERE ${column} IN (SELECT value FROM json_each(?)) ORDER BY rowid`).bind(json).all()).results;
    rows.comments=(await env.DB.prepare('SELECT * FROM comments WHERE thread_id IN (SELECT id FROM comment_threads WHERE page_id IN (SELECT value FROM json_each(?))) ORDER BY rowid').bind(json).all()).results;
    rows.objects=[];
    for(const file of rows.files){
      const object=await env.FILES.get(file.storage_key);
      rows.objects.push({key:file.storage_key,bytes:object?[...new Uint8Array(await object.arrayBuffer())]:null});
    }
    return rows;
  };
  const refusals:{status:number;code:string;unchanged:boolean}[]=[];
  const unchanged=async(run:()=>Promise<{status:number;data:any}>,ids:string[],code?:string)=>{
    const before=await inventory(ids),result=await run();
    expect(result.status,JSON.stringify(result)).toBeGreaterThanOrEqual(400);
    if(code)expect(result.data.code).toBe(code);
    expect(await inventory(ids),'refused request leaves storage and bytes unchanged').toEqual(before);
    refusals.push({status:result.status,code:result.data.code,unchanged:true});
    return result;
  };
  for(const mode of ['single','empty'] as const){
    const refusalStart=refusals.length;
    const root=await create('synthetic-slate-'+mode),child=await create('synthetic-slate-'+mode+'-child',root.id);
    await grant(root.id);
    const editorGrant=await write('POST','/api/sharing',{targetKind:'page',targetId:root.id,principalKind:'member',principalId:outsider.memberId,level:'edit'});
    const corpus=[root,child],ids=corpus.map(page=>page.id),outsideIds=[outside.id,editOnly.id,hidden.id];
    const endpoint=mode==='single'?`/api/archive/${root.id}/permanent-delete`:'/api/archive/empty-trash';
    const preview=mode==='single'?`/api/archive/${root.id}/permanent-delete-preview`:'/api/archive/empty-trash-preview';
    const captured={operationKey:createUlid(),expectedRevisionId:await f.revision(root.id),blocks:[paragraph('synthetic-slate-captured-body')]};
    const host=await write('POST','/api/pages',{containerId:f.containerId,title:'synthetic-slate-retained-links',blocks:[{...paragraph(''),content:{text:[
      {text:'Plain reference',link:{href:`/app/pages/${root.id}`}},
      {text:' exact citation',link:{href:`/app/pages/${root.id}?detail=history&revision=${root.revision}`}},
      {text:root.label,mention:{kind:'page',id:root.id,label:root.label}},
    ]}}]});
    await grant(host.value.pageId);
    if(mode==='single'){
      await unchanged(()=>request('POST',endpoint,{operationKey:createUlid(),confirmedPageIds:ids}),ids,'NOT_TRASHED');
      await unchanged(()=>request('GET',preview),ids,'NOT_TRASHED');
    }
    await trash(root.id);
    const shown=await request('GET',preview);expect(shown.status).toBe(200);
    expect(shown.data.items.map((page:any)=>({id:page.id,title:page.title}))).toEqual(expect.arrayContaining(corpus.map(page=>({id:page.id,title:page.label}))));
    expect(shown.data.items.map((page:any)=>page.id).sort()).toEqual([...ids].sort());
    await unchanged(()=>request('POST',endpoint,{operationKey:createUlid(),confirmedPageIds:[root.id]}),ids,'CONFIRM_CASCADE');
    await unchanged(()=>request('POST',endpoint,{operationKey:createUlid(),confirmedPageIds:[...ids,editOnly.id]}),[...ids,...outsideIds],'CONFIRM_CASCADE');
    if(mode==='single')await trash(root.id,'restore');
    const later=await create('synthetic-slate-later-'+mode,mode==='single'?root.id:undefined);
    await grant(later.id);await trash(mode==='single'?root.id:later.id);
    await unchanged(()=>request('POST',endpoint,{operationKey:createUlid(),confirmedPageIds:ids}),[...ids,later.id],'CONFIRM_CASCADE');
    ids.push(later.id);corpus.push(later);
    const stale=f.cookies[f.readerId],mail=captureMail();
    try {
      f.cookies[f.readerId]=await sessionFor(f.readerId);
      await unchanged(()=>request('POST',endpoint,{operationKey:createUlid(),confirmedPageIds:ids}),ids,'STEP_UP_REQUIRED');
    } finally {f.cookies[f.readerId]=stale;mail.restore();}
    await unchanged(()=>f.request('POST',endpoint,{operationKey:createUlid(),confirmedPageIds:ids},outsider.memberId),ids);
    const editorPreview=await f.request('GET',preview,undefined,outsider.memberId);
    if(mode==='single')expect(editorPreview.status).toBe(404);
    else {expect(editorPreview.status).toBe(200);expect(editorPreview.data.items).toEqual([]);}
    await trash(root.id,'restore');
    await write('POST','/api/sharing',{targetKind:'page',targetId:root.id,id:editorGrant.value.id,principalKind:'member',principalId:outsider.memberId,level:'edit',revoke:true});
    await trash(root.id);
    const refreshed=await request('GET',preview);
    expect(refreshed.status).toBe(200);
    expect(refreshed.data.items.map((page:any)=>page.id).sort()).toEqual([...ids].sort());
    const before=await inventory(ids),untouched=await inventory(outsideIds);
    expect(before.page_blocks.length).toBeGreaterThan(0);
    expect(before.page_revisions.length).toBeGreaterThan(ids.length);
    expect(before.files).toHaveLength(ids.length*2);
    expect(before.comments).toHaveLength(ids.length);
    expect(before.page_views).toHaveLength(ids.length);
    const input={operationKey:createUlid(),confirmedPageIds:ids},started=Date.now();
    const result=await request('POST',endpoint,input);
    expect(result.status,JSON.stringify(result)).toBe(200);
    expect(result.data.value.deletedPageIds).toEqual([...ids].sort());
    const after=await inventory(ids);
    expect(after.page_blocks).toEqual([]);expect(after.page_views).toEqual([]);
    for(const row of after.pages)expect(row).toMatchObject({title:'',owner_member_id:null,deleted_at:result.data.receipt.committedAt});
    for(const row of after.page_revisions)expect(row).toMatchObject({body_json:'[]',properties_json:'{}',content_hash:'',author_member_id:null,label:null,deleted_at:result.data.receipt.committedAt});
    expect(after.page_revisions.map((row:any)=>row.id)).toEqual(before.page_revisions.map((row:any)=>row.id));
    for(const row of after.comments)expect(row).toMatchObject({body_json:'[]',author_member_id:null,deleted_at:result.data.receipt.committedAt});
    for(const row of after.files)expect(row).toMatchObject({original_name:'Deleted file',content_type:'application/octet-stream',size_bytes:0,deleted_at:result.data.receipt.committedAt});
    for(const row of after.objects)expect(row.bytes).toBeNull();
    expect(after.content_tombstones).toHaveLength(ids.length);
    expect(await inventory(outsideIds),'nonselected live, edit-only and hidden trash retain every row and byte').toEqual(untouched);
    for(const page of corpus)for(const route of [`/api/pages/${page.id}`,`/api/revisions/${page.id}/${page.revision}`,`/api/pages/${page.id}/link-card?revision=${page.revision}`]){
      const gone=await request('GET',route);
      expect(gone.status).toBe(404);expect(gone.data.code).toBe('PAGE_ERASED');
      expect(gone.data.details).toEqual({kind:'page',deletedAt:result.data.receipt.committedAt});
    }
    const retainedHost=await request('GET',`/api/pages/${host.value.pageId}`);
    expect(retainedHost.status).toBe(200);
    expect(retainedHost.data.mentions[root.id]).toMatchObject({label:'Deleted page',state:'deleted',available:false,deletedAt:result.data.receipt.committedAt});
    expect(JSON.stringify(retainedHost.data.blocks)).not.toContain(root.label);
    const timeline=await request('GET','/api/activity?kind=page&limit=100');
    expect(timeline.status).toBe(200);
    for(const row of before.activity_entries.filter((row:any)=>row.target_kind==='page')){
      const kept=after.activity_entries.find((entry:any)=>entry.id===row.id);
      expect(kept).toMatchObject({actor_member_id:null,detail_json:'{}',occurred_at:row.occurred_at});
      expect(timeline.data.items.find((entry:any)=>entry.id===row.id)).toMatchObject({actor:null,deleted:true,context:{},target:{kind:'page',id:row.target_id},occurredAt:row.occurred_at});
    }
    expect(Date.now()-started).toBeLessThan(300000);
    expect((await request('POST',endpoint,input)).data).toEqual(result.data);
    await unchanged(()=>request('PUT',`/api/pages/${root.id}/blocks`,captured),ids);
    await unchanged(()=>request('POST',`/api/archive/${root.id}`,{operationKey:createUlid(),expectedRevisionId:root.revision,action:'restore'}),ids);
    const revoked=await f.request('GET','/api/activity?kind=page&limit=100',undefined,outsider.memberId);
    expect(revoked.data.items.some((entry:any)=>ids.includes(entry.target.id))).toBe(false);
    for(const route of [`/api/pages/${root.id}`,`/api/revisions/${root.id}/${root.revision}`]){
      const denied=await f.request('GET',route,undefined,outsider.memberId);
      expect(denied.status).toBe(404);expect(denied.data.code).toBe('NOT_FOUND');
      expect(denied.data.details??null).toBeNull();
    }
    console.info('ERASURE_RECEIPT',JSON.stringify({mode,receipt:result.data.receipt,ids,preview:refreshed.data,priorPreview:shown.data,refusals:refusals.slice(refusalStart),inventory:{before,after},outsideUnchanged:true,before:{blocks:before.page_blocks.length,revisions:before.page_revisions.length,files:before.files.length,comments:before.comments.length,views:before.page_views.length,objects:before.objects.map((row:any)=>({key:row.key,bytes:row.bytes.length}))},after:{blocks:after.page_blocks.length,revisions:after.page_revisions.length,files:after.files.length,comments:after.comments.length,views:after.page_views.length,objects:after.objects},elapsedMs:Date.now()-started}));
  }
}
