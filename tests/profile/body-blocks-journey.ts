import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {PDFDocument,PDFArray,PDFDict,PDFName} from 'pdf-lib';
import type {createApi} from '../../src/core/app/hono';

/** Existing core-profile HTTP journey: real storage, search, downloadable files and re-import. */
export async function bodyBlocksJourney(api:ReturnType<typeof createApi>,containerId:string,cookie:string) {
  const request=(path:string,method='GET',body?:unknown)=>api.request('https://slate.example'+path,{method,headers:{cookie,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},env);
  const created=await request('/api/pages','POST',{operationKey:crypto.randomUUID(),containerId,title:'Release readiness handbook'});
  expect(created.status).toBe(200);
  const {value:{pageId}}=await created.json<any>();
  const current=await (await request('/api/pages/'+pageId)).json<any>();
  const heading=crypto.randomUUID(),toc=crypto.randomUUID();
  const content=[
    {id:toc,blockType:'table-of-contents',content:{minLevel:1,maxLevel:2,style:'nested'}},
    {id:heading,blockType:'heading',content:{level:1,text:[{text:'Rollout plan'}]}},
    {id:crypto.randomUUID(),blockType:'paragraph',content:{text:[{text:'Checks '},{text:'Done',status:{colour:'green'}},{text:' and '},{text:'Blocked',status:{colour:'red'}}]}},
    {id:crypto.randomUUID(),blockType:'heading',content:{level:2,text:[{text:'Rollback procedure'}]}},
    {id:crypto.randomUUID(),blockType:'heading',content:{level:3,text:[{text:'Operator detail'}]}},
  ].map((block,index)=>({...block,parentBlockId:null,treePosition:String(index)}));
  const saved=await request(`/api/pages/${pageId}/blocks`,'PUT',{operationKey:crypto.randomUUID(),expectedRevisionId:current.page.revisionId,blocks:content});
  expect(saved.status,await saved.clone().text()).toBe(200);
  const found=await (await request('/api/search?q=Blocked')).json<any>();
  expect(found.items.some((item:any)=>item.id===pageId)).toBe(true);
  const colours=(doc:any)=>doc.blocks.flatMap((block:any)=>block.content.text??[]).filter((span:any)=>span.status).map((span:any)=>[span.text,span.status.colour]);
  expect(colours(await (await request('/api/pages/'+pageId)).json())).toEqual([['Done','green'],['Blocked','red']]);
  async function reimport(bytes:Uint8Array,format:string,name:string) {
    const before=new Set((await (await request('/api/pages')).json<any>()).items.map((page:any)=>page.id));
    const form=new FormData();form.set('operationKey',crypto.randomUUID());form.set('format',format);
    form.set('file',new File([bytes as Uint8Array<ArrayBuffer>],name));
    const staged=await api.request('https://slate.example/api/imports',{method:'POST',headers:{cookie},body:form},env);
    expect(staged.status,await staged.clone().text()).toBe(200);
    const job=await staged.json<any>();
    const result=await request('/api/imports/'+job.id+'/run','POST');
    expect(result.status,await result.clone().text()).toBe(200);
    expect(await result.json()).toMatchObject({state:'completed'});
    const pages=(await (await request('/api/pages')).json<any>()).items.filter((page:any)=>!before.has(page.id));
    expect(pages).toHaveLength(1);
    return (await request('/api/pages/'+pages[0].id)).json<any>();
  }
  for(const format of ['markdown','html','pdf'] as const) {
    const exported=await request('/api/exports/readable','POST',{scope:'page',id:pageId,format});
    expect(exported.status,exported.ok?'':await exported.clone().text()).toBe(200);
    const bytes=new Uint8Array(await exported.arrayBuffer()),files=unzipSync(bytes),extension=format==='markdown'?'md':format;
    const portable=files[`pages/${pageId}.${extension}`]!;
    expect(portable).toBeDefined();
    if(format==='markdown') {
      const markdown=strFromU8(portable);
      expect(markdown).toContain(`[Rollout plan](#block-${heading})`);
      expect(markdown).not.toContain('[Operator detail](');
    }
    if(format==='pdf') {
      const pdf=await PDFDocument.load(portable),pages=pdf.getPages(),destinations=pages.map(page=>page.ref.toString());
      const links=pages.flatMap(page=>{const annots=page.node.Annots();return annots?annots.asArray().map(ref=>pdf.context.lookup(ref,PDFDict)):[];});
      expect(links.length).toBeGreaterThan(0);
      for(const link of links) {
        expect(link.lookup(PDFName.of('Subtype'))).toEqual(PDFName.of('Link'));
        const destination=link.lookup(PDFName.of('Dest'),PDFArray);
        expect(destinations).toContain(destination.get(0).toString());
        const rect=link.lookup(PDFName.of('Rect'),PDFArray).asArray().map(item=>Number(item.toString()));
        expect(rect[2]!>rect[0]! && rect[3]!>rect[1]!).toBe(true);
      }
    } else expect(colours(await reimport(portable,format,`portable.${extension}`))).toEqual([['Done','green'],['Blocked','red']]);
    const restored=await reimport(bytes,'slate-readable',`${format}-archive.zip`);
    expect(colours(restored)).toEqual([['Done','green'],['Blocked','red']]);
    expect(restored.blocks.find((block:any)=>block.blockType==='table-of-contents')?.content).toEqual({minLevel:1,maxLevel:2,style:'nested'});
  }
}
