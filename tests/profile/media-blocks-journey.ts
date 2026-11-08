import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {seedMember,sessionFor} from '../e2e/setup/fixtures';

/** Native core-profile routes exercise stored bytes, both dispositions and current page authority. */
export async function mediaBlocksJourney(api:ReturnType<typeof createApi>, workspaceId:string, cookie:string) {
  const origin='https://localhost:8787';
  const request=(path:string,method='GET',body?:unknown,session=cookie)=>api.request(origin+path,{
    method,headers:{...(session?{cookie:session}:{}),...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  },env);
  async function ok(path:string,method='GET',body?:unknown) {
    const response=await request(path,method,body);
    expect(response.status,await response.clone().text()).toBe(200);
    return response.json<any>();
  }
  const space=(await ok('/api/containers','POST',{operationKey:crypto.randomUUID(),name:'Media custody',visibility:'private'})).value;
  const pageId=(await ok('/api/pages','POST',{operationKey:crypto.randomUUID(),containerId:space.id,title:'Media delivery'})).value.pageId;
  const outsider=(await seedMember(workspaceId,{role:'member',displayName:'Uninvited member',email:['synthetic-slate-outsider','test.invalid'].join('@')})).memberId;
  const reader=(await seedMember(workspaceId,{role:'member',displayName:'Media reader',email:['synthetic-slate-reader','test.invalid'].join('@')})).memberId;
  const outsiderCookie=await sessionFor(outsider), readerCookie=await sessionFor(reader);
  await ok('/api/sharing','POST',{operationKey:crypto.randomUUID(),targetKind:'page',targetId:pageId,principalKind:'member',principalId:reader,level:'view'});
  async function upload(name:string,type:string,bytes:string,page=pageId) {
    const form=new FormData();form.set('operationKey',crypto.randomUUID());form.set('pageId',page);
    form.set('file',new File([bytes],name,{type}));
    return api.request(origin+'/api/media',{method:'POST',headers:{cookie},body:form},env);
  }
  const unsafe='<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect id="safe" width="10" height="10" fill="red" onclick="alert(2)"/><use href="https://outside.invalid/leak"/><use href="#safe"/><path fill="url(https://outside.invalid/paint)"/></svg>';
  const types=[['image','image/svg+xml',unsafe],['video','video/mp4','synthetic-slate-video'],['audio','audio/mpeg','synthetic-slate-audio'],['file','text/plain','synthetic-slate-attachment']] as const;
  const files=[];
  for(const [kind,type,bytes] of types) {
    const response=await upload(`synthetic-slate-${kind}`,type,bytes);
    expect(response.status,await response.clone().text()).toBe(200);
    files.push({...((await response.json<any>()).value),kind,bytes,blockId:crypto.randomUUID()});
  }
  const hiddenResponse=await upload('synthetic-slate-hidden','text/plain','synthetic-slate-hidden');
  expect(hiddenResponse.status).toBe(200);
  const hidden=(await hiddenResponse.json<any>()).value;
  const otherPage=(await ok('/api/pages','POST',{operationKey:crypto.randomUUID(),containerId:space.id,title:'Other page'})).value.pageId;
  const otherResponse=await upload('synthetic-slate-other','text/plain','synthetic-slate-other',otherPage);
  expect(otherResponse.status).toBe(200);
  const other=(await otherResponse.json<any>()).value;
  const beforeUnsafe=await env.DB.prepare('SELECT COUNT(*) AS count FROM files').first();
  const beforeObjects=(await env.FILES.list()).objects.map(object=>object.key);
  const entities=await upload('synthetic-slate-entity.svg','image/svg+xml','<!DOCTYPE svg [<!ENTITY secret "unsafe">]><svg xmlns="http://www.w3.org/2000/svg"><text>&secret;</text></svg>');
  const entityRefusal=await entities.json();
  expect(entities.status).toBe(400);expect(entityRefusal).toMatchObject({code:'UNSAFE_SVG'});
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM files').first()).toEqual(beforeUnsafe);
  expect((await env.FILES.list()).objects.map(object=>object.key)).toEqual(beforeObjects);
  let doc=await ok(`/api/pages/${pageId}`);
  await ok(`/api/pages/${pageId}/blocks`,'PUT',{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,blocks:files.map((f,index)=>({id:f.blockId,blockType:'media',treePosition:String(index),content:{kind:f.kind,source:{fileId:f.id,url:f.url,name:f.name},caption:`Caption ${f.kind}`,alt:`Description ${f.kind}`}}))});
  doc=await ok(`/api/pages/${pageId}`);
  await ok(`/api/pages/${pageId}`,'PATCH',{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,properties:{icon:`file:${files[0]!.id}`,coverFileId:files[0]!.id}});
  doc=await ok(`/api/pages/${pageId}`);
  expect(doc.blocks.map((b:any)=>[b.content.kind,b.content.caption,b.content.alt])).toEqual(types.map(([kind])=>[kind,`Caption ${kind}`,`Description ${kind}`]));
  const slug='synthetic-slate-media';
  await ok(`/api/publishing/${pageId}`,'POST',{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,host:'localhost:8787',slug});
  const published=await request(`/p/${slug}`,'GET',undefined,'');expect(published.status).toBe(200);
  const html=await published.text();
  expect(html).toContain(`media/${files[0]!.id}?display=cover`);expect(html).toContain(`media/${files[0]!.id}?display=icon`);
  for(const f of files) expect(html).toContain(`Caption ${f.kind}`);
  const matrix=[];let sanitizedSvg='';
  for(const [audience,prefix,session] of [['editor','/api/media',cookie],['reader','/api/media',readerCookie],['public',`/p/${slug}/media`,'']] as const) {
    for(const f of files) {
      for(const display of [undefined,f.blockId,'inline','missing-block','icon','cover']) {
        const path=`${prefix}/${f.id}${display===undefined?'':`?display=${display}`}`;
        const response=await request(path,'GET',undefined,session);
        const inline=(display===f.blockId&&f.kind!=='file') || ((display==='icon'||display==='cover')&&f.kind==='image');
        const headers={status:response.status,type:response.headers.get('content-type'),disposition:response.headers.get('content-disposition'),nosniff:response.headers.get('x-content-type-options')};
        expect(headers.status,path).toBe(200);expect(headers.type,path).toBe(f.contentType);
        expect(headers.disposition,path).toMatch(inline?/^inline;/:/^attachment;/);expect(headers.nosniff,path).toBe('nosniff');
        const bytes=new TextDecoder().decode(await response.arrayBuffer());
        if(f.kind==='image') {sanitizedSvg=bytes;expect(bytes).toContain('<rect');expect(bytes).toContain('href="#safe"');expect(bytes).not.toMatch(/<script|onload|onclick|outside\.invalid|<!ENTITY|<!DOCTYPE/);}
        else expect(bytes).toBe(f.bytes);
        matrix.push({audience,kind:f.kind,display:display??'none',...headers});
      }
    }
  }
  const revisionHtml=await request(`/p/${slug}?revision=${doc.page.revisionId}`,'GET',undefined,'');
  expect(revisionHtml.status).toBe(200);
  expect(await revisionHtml.text()).toContain(`revision=${doc.page.revisionId}&amp;display=cover`);
  const revisionFile=await request(`/p/${slug}/media/${files[0]!.id}?revision=${doc.page.revisionId}&display=icon`,'GET',undefined,'');
  expect(revisionFile.status).toBe(200);expect(revisionFile.headers.get('content-disposition')).toMatch(/^inline;/);
  const attachmentId=crypto.randomUUID();
  doc=await ok(`/api/pages/${pageId}`);
  await ok(`/api/pages/${pageId}/blocks`,'PUT',{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,blocks:[...doc.blocks.map(({id,parentBlockId,treePosition,blockType,content}:any)=>({id,parentBlockId,treePosition,blockType,content})),{id:attachmentId,blockType:'media',treePosition:'9',content:{kind:'file',source:{fileId:files[0]!.id,url:files[0]!.url,name:'Image attachment'},caption:'Image download',alt:'Image kept as an attachment'}}]});
  doc=await ok(`/api/pages/${pageId}`);
  for(const [prefix,session] of [['/api/media',cookie],[`/p/${slug}/media`,'']] as const) {
    const response=await request(`${prefix}/${files[0]!.id}?display=${attachmentId}`,'GET',undefined,session);
    expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('image/svg+xml');expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    matrix.push({audience:session?'editor':'public',kind:'image-attachment',display:attachmentId,status:response.status,type:response.headers.get('content-type'),disposition:response.headers.get('content-disposition'),nosniff:response.headers.get('x-content-type-options')});
  }
  const beforeRefusedPage=await env.DB.prepare('SELECT * FROM pages WHERE id=?').bind(pageId).first();
  const beforeRefused=(await env.DB.prepare('SELECT id,page_id,size_bytes,deleted_at FROM files ORDER BY id').all()).results;
  const refusals=[
    [outsiderCookie,`/api/media/${files[0]!.id}?display=icon`],
    [readerCookie,`/api/media/${hidden.id}`],
    ['',`/p/${slug}/media/${hidden.id}`],
    ['',`/p/${slug}/media/${other.id}`],
  ];
  const refusedRequests=[];
  for(const [session,path] of refusals) {
    const response=await request(path!,'GET',undefined,session),body=await response.json();
    expect(response.status,path).toBe(404);expect(body).toMatchObject({code:'NOT_FOUND'});
    refusedRequests.push({path,status:response.status,type:response.headers.get('content-type'),disposition:response.headers.get('content-disposition'),nosniff:response.headers.get('x-content-type-options'),body});
  }
  expect((await request(`/api/media/${hidden.id}`)).status).toBe(200);
  expect((await env.DB.prepare('SELECT id,page_id,size_bytes,deleted_at FROM files ORDER BY id').all()).results).toEqual(beforeRefused);
  expect(await env.DB.prepare('SELECT * FROM pages WHERE id=?').bind(pageId).first()).toEqual(beforeRefusedPage);
  await ok(`/api/publishing/${pageId}`,'POST',{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,host:'localhost:8787',slug,revoke:true});
  for(const suffix of ['',`/media/${files[0]!.id}?display=icon`]) {
    const path=`/p/${slug}${suffix}`,response=await request(path,'GET',undefined,'');expect(response.status).toBe(404);
    refusedRequests.push({path,status:response.status,type:response.headers.get('content-type'),disposition:response.headers.get('content-disposition'),nosniff:response.headers.get('x-content-type-options'),body:await response.text()});
  }
  expect((await request(`/api/media/${files[0]!.id}?display=icon`)).status).toBe(200);
  await ok(`/api/archive/${pageId}`,'POST',{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,action:'trash'});
  for(const session of [cookie,readerCookie]) {
    const path=`/api/media/${files[0]!.id}?display=icon`,response=await request(path,'GET',undefined,session);expect(response.status).toBe(404);
    refusedRequests.push({path,status:response.status,type:response.headers.get('content-type'),disposition:response.headers.get('content-disposition'),nosniff:response.headers.get('x-content-type-options'),body:await response.text()});
  }
  expect((await request(`/p/${slug}/media/${files[0]!.id}`,'GET',undefined,'')).status).toBe(404);
  console.warn('MEDIA_DISPOSITION_MATRIX '+JSON.stringify({matrix,refusedRequests,sanitizedSvg,entitySvg:{status:entities.status,body:entityRefusal,filesUnchanged:true,objectsUnchanged:true},revokedPublic:404,trashedPage:404}));
}
