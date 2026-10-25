import {resetDeployment} from '../setup/reset-deployment';
import {seedWorkspace,seedMember,sessionFor} from '../setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import {env} from 'cloudflare:test';
import {unzipSync,strFromU8} from 'fflate';
import {expect,vi} from 'vitest';
import {contentLimits} from '../../../src/core/features/editor/limits';

export async function embedRefusalsJourney(req:(path:string,body?:unknown,auth?:string)=>Response|Promise<Response>,pageId:string,blocks:{id:string;content:{url:string}}[],otherCookie:string,freshCookie:string,otherMemberId:string){
  const seen:Request[]=[],base='https://slate.test',host='embed.figma.com';
  const workspaceId=(await env.DB.prepare('SELECT workspace_id FROM pages WHERE id=?').bind(pageId).first<string>('workspace_id'))!;
  const clear=()=>env.DB.prepare('DELETE FROM provider_embed_observations WHERE workspace_id=? AND provider_host=?').bind(workspaceId,host).run();
  let response=()=>new Response('<h1>Recorded design</h1>');
  const edge=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const request=new Request(input,init);seen.push(request);expect(new URL(request.url).hostname).toBe(host);expect(request.headers.get('cookie')).toBeNull();expect(request.headers.get('authorization')).toBeNull();expect(request.redirect).toBe('manual');return response();});
  const route=`/api/pages/${pageId}/embeds/${blocks[0]!.id}/status`;
  try{
    expect((await req(route,undefined,otherCookie)).status).toBe(404);expect(seen).toHaveLength(0);
    const cases:{headers:Record<string,string>;verdict:string}[]=[
      {headers:{'x-frame-options':'DENY'},verdict:'refuses'},
      {headers:{'x-frame-options':'SAMEORIGIN'},verdict:'refuses'},
      {headers:{'content-security-policy':"frame-ancestors 'self'"},verdict:'refuses'},
      {headers:{'content-security-policy':"frame-ancestors https://slate.test"},verdict:'embeddable'},
      {headers:{'content-security-policy':"frame-ancestors https://*.slate.test"},verdict:'refuses'},
      {headers:{'content-security-policy':"frame-ancestors *"},verdict:'embeddable'},
    ];
    for(const item of cases){await clear();seen.length=0;response=()=>new Response('<h1>Recorded design</h1>',{headers:item.headers});expect((await (await req(route)).json<any>()).verdict).toBe(item.verdict);expect(seen.map(x=>x.method)).toEqual(item.verdict==='refuses'?['HEAD']:['HEAD','GET']);}
    // Header compatibility and the stored verdict cover both configured deployment origins.
    const crossBindings={...env,SLATE_PROFILE:undefined,PUBLIC_PAGE_HOST:'public.slate.test'},crossApi=createApi();
    const cross=(path:string,body?:unknown)=>crossApi.request(base+path,{method:body?'POST':'GET',headers:{cookie:freshCookie,origin:base,'content-type':'application/json'},body:body?JSON.stringify(body):undefined},crossBindings);
    await clear();response=()=>new Response('<h1>Recorded design</h1>',{headers:{'content-security-policy':'frame-ancestors https://slate.test https://public.slate.test'}});
    expect((await (await cross(route)).json<any>()).verdict).toBe('embeddable');
    await clear();response=()=>new Response(null,{headers:{'content-security-policy':'frame-ancestors https://slate.test'}});
    expect((await (await cross(route)).json<any>()).verdict).toBe('refuses');
    const crossDoc=await (await cross(`/api/pages/${pageId}`)).json<any>();
    expect((await cross(`/api/publishing/${pageId}`,{operationKey:crypto.randomUUID(),expectedRevisionId:crossDoc.page.revisionId,host:'public.slate.test',slug:'cross-host-refusal'})).status).toBe(200);
    seen.length=0;const crossPublic=await crossApi.request('https://public.slate.test/p/cross-host-refusal',{},crossBindings);
    expect(crossPublic.status).toBe(200);expect(await crossPublic.text()).not.toContain('Load Figma embed');expect(seen).toHaveLength(0);
    for(const body of ['Embedding is disabled','This document cannot be embedded']){await clear();response=()=>new Response(body);expect((await (await req(route)).json<any>()).verdict).toBe('refuses');}
    await clear();response=()=>new Response('<h1>Recorded design</h1>');
    await env.DB.prepare('INSERT INTO provider_embed_observations VALUES (?,?,?,?,?)').bind(workspaceId,host,base,'refuses',new Date(Date.now()-86400001).toISOString()).run();
    expect((await (await req(route)).json<any>()).verdict).toBe('embeddable');
    await clear();response=()=>new Response(null,{status:403});expect((await (await req(route)).json<any>()).verdict).toBe('refuses');
    await clear();response=()=>new Response(null,{status:302,headers:{location:'https://attacker.test/private'}});seen.length=0;expect((await (await req(route)).json<any>()).verdict).toBe('unknown');expect(seen).toHaveLength(1);
    await clear();response=()=>new Response('x'.repeat(contentLimits.maximumUrlFetchBytes+1));expect((await (await req(route)).json<any>()).verdict).toBe('unknown');
    await clear();edge.mockImplementation(async(input,init)=>{const request=new Request(input,init);seen.push(request);return new Promise((_resolve,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('Timed out')),{once:true}));});
    const started=Date.now();expect((await (await req(route)).json<any>()).verdict).toBe('unknown');expect(Date.now()-started).toBeLessThan(6000);
    edge.mockImplementation(async(input,init)=>{const request=new Request(input,init);seen.push(request);expect(new URL(request.url).hostname).toBe(host);return new Response(null,{headers:{'x-frame-options':'DENY'}});});
    await clear();const verdict=await (await req(route)).json<any>();expect(verdict.verdict).toBe('refuses');expect(Number.isFinite(Date.parse(verdict.observedAt))).toBe(true);
    seen.length=0;expect((await (await req(route)).json<any>()).verdict).toBe('refuses');expect(seen).toHaveLength(0);
    const document=await (await req(`/api/pages/${pageId}`)).json<any>();
    expect((await req(`/api/publishing/${pageId}`,{operationKey:crypto.randomUUID(),expectedRevisionId:document.page.revisionId,host:'slate.test',slug:'refusal-proof'})).status).toBe(200);
    const publicPage=await (await req('/p/refusal-proof',undefined,'')).text();expect(publicPage).toContain('The provider does not allow embedding.');expect(publicPage).not.toContain('Load Figma embed');expect(publicPage).toContain(blocks[0]!.content.url.replaceAll('&','&amp;'));
    expect((await req(`/p/refusal-proof/embeds/${blocks[0]!.id}`,undefined,'')).status).toBe(200);expect(seen).toHaveLength(0);
    expect((await req(route,undefined,'')).status).toBe(401);expect(seen).toHaveLength(0);
    const exported=await req('/api/exports/workspace',{operationKey:crypto.randomUUID()},freshCookie);expect(exported.status,await exported.clone().text()).toBe(200);
    const archiveId=(await exported.json<any>()).id;
    const download=await req(`/api/exports/${archiveId}/download`,undefined,freshCookie);expect(download.status).toBe(200);
    const bytes=new Uint8Array(await download.arrayBuffer()),entries=unzipSync(bytes),manifest=JSON.parse(strFromU8(entries['manifest.json']!));
    expect(manifest.tables.provider_embed_observations).toEqual([{workspace_id:workspaceId,provider_host:host,deployment_origin:base,verdict:'refuses',observed_at:'1970-01-01T00:00:00.000Z'}]);
    expect((await req('/api/members/remove',{operationKey:crypto.randomUUID(),memberId:otherMemberId,erase:true},freshCookie)).status).toBe(200);
    expect(await env.DB.prepare('SELECT * FROM provider_embed_observations WHERE workspace_id=?').bind(workspaceId).first()).toBeNull();
    const form=new FormData();form.set('file',new File([bytes],'workspace.zip',{type:'application/zip'}));
    const restored=await createApi().request(base+'/api/exports/restore',{method:'POST',headers:{cookie:freshCookie,origin:base},body:form},{...env,SLATE_PROFILE:undefined,PUBLIC_PAGE_HOST:'slate.test'});
    expect(restored.status).toBe(409);expect((await restored.json<any>()).code).toBe('ERASURE_CHECKPOINT');
    expect((await (await req(route)).json<any>()).verdict).toBe('refuses');seen.length=0;
    const freshExport=await req('/api/exports/workspace',{operationKey:crypto.randomUUID()},freshCookie);expect(freshExport.status).toBe(200);
    const freshId=(await freshExport.json<any>()).id,freshDownload=await req(`/api/exports/${freshId}/download`,undefined,freshCookie);expect(freshDownload.status).toBe(200);
    const freshForm=new FormData();freshForm.set('file',new File([await freshDownload.arrayBuffer()],'workspace.zip',{type:'application/zip'}));
    await resetDeployment();const target=(await seedWorkspace()).workspaceId,targetOwner=(await seedMember(target,{email:'owner@slate.test',displayName:'Alex Owner',role:'owner',isSetupOwner:true})).memberId,targetCookie=await sessionFor(targetOwner,{freshProof:true});
    const freshRestore=await createApi().request(base+'/api/exports/restore',{method:'POST',headers:{cookie:targetCookie,origin:base},body:freshForm},{...env,SLATE_PROFILE:undefined,PUBLIC_PAGE_HOST:'slate.test'});
    expect(freshRestore.status,await freshRestore.clone().text()).toBe(200);
    expect(await env.DB.prepare('SELECT observed_at FROM provider_embed_observations WHERE workspace_id=? AND provider_host=?').bind(workspaceId,host).first('observed_at')).toBe('1970-01-01T00:00:00.000Z');
    expect(seen).toHaveLength(0);


  }finally{edge.mockRestore();await clear();}
}
