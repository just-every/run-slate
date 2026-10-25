import {expect,vi} from 'vitest';
import {contentLimits} from '../../../src/core/features/editor/limits';

export async function embedRefusalsJourney(req:(path:string,body?:unknown,auth?:string)=>Promise<Response>,pageId:string,blocks:{id:string;content:{url:string}}[],otherCookie:string){
  const seen:Request[]=[],base='https://slate.test',host='embed.figma.com';
  const clear=()=>caches.default.delete(`${base}/.derived/embed-verdict/${host}`);
  let response=()=>new Response('<h1>Recorded design</h1>');
  const edge=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const request=new Request(input,init);seen.push(request);expect(new URL(request.url).hostname).toBe(host);expect(request.headers.get('cookie')).toBeNull();expect(request.headers.get('authorization')).toBeNull();expect(request.redirect).toBe('manual');return response();});
  const route=`/api/pages/${pageId}/embeds/${blocks[0]!.id}/status`;
  try{
    expect((await req(route,undefined,otherCookie)).status).toBe(404);expect(seen).toHaveLength(0);
    const cases=[
      {headers:{'x-frame-options':'DENY'},verdict:'refuses'},
      {headers:{'x-frame-options':'SAMEORIGIN'},verdict:'refuses'},
      {headers:{'content-security-policy':"frame-ancestors 'self'"},verdict:'refuses'},
      {headers:{'content-security-policy':"frame-ancestors https://slate.test"},verdict:'embeddable'},
      {headers:{'content-security-policy':"frame-ancestors https://*.slate.test"},verdict:'refuses'},
      {headers:{'content-security-policy':"frame-ancestors *"},verdict:'embeddable'},
    ];
    for(const item of cases){await clear();seen.length=0;response=()=>new Response('<h1>Recorded design</h1>',{headers:item.headers});expect((await (await req(route)).json<any>()).verdict).toBe(item.verdict);expect(seen.map(x=>x.method)).toEqual(item.verdict==='refuses'?['HEAD']:['HEAD','GET']);}
    for(const body of ['Embedding is disabled','This document cannot be embedded']){await clear();response=()=>new Response(body);expect((await (await req(route)).json<any>()).verdict).toBe('refuses');}
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
  }finally{edge.mockRestore();await clear();}
}
