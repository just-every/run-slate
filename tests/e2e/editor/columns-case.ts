import {expect} from 'vitest';
import {zipSync,strToU8,unzipSync} from 'fflate';

/** Layout validation, format preservation and source imports through HTTP doors. */
export async function columnsCase(request:(method:string,path:string,body?:unknown,actor?:'owner'|'reader')=>Promise<Response>,containerId:string){
 const json=async(method:string,path:string,body?:unknown)=>{const response=await request(method,path,body),data=await response.json<any>();expect(response.status,JSON.stringify(data)).toBe(200);return data;};
 const section=crypto.randomUUID(),columns=Array.from({length:3},()=>crypto.randomUUID());
 const blocks=[{id:section,blockType:'columns',content:{count:3},treePosition:'0'},...columns.flatMap((id,index)=>[
  {id,blockType:'column',content:{},parentBlockId:section,treePosition:`${index+1}0`},
  {id:crypto.randomUUID(),blockType:'paragraph',content:{text:[{text:['Plan the response','Assign the lead','Confirm completion'][index]}]},parentBlockId:id,treePosition:`${index+1}1`},
 ])];
 const create=(body:unknown)=>request('POST','/pages',{operationKey:crypto.randomUUID(),containerId,title:'Response columns',blocks:body});
 for(const count of [0,1,6]){
  const invalid=await create([{id:crypto.randomUUID(),blockType:'columns',treePosition:'0',content:{count}}]);
  expect(invalid.status).toBe(400);expect((await invalid.json<any>()).message).toBeTruthy();
 }
 expect((await create([{id:section,blockType:'columns',content:{count:3},treePosition:'0'}])).status).toBe(400);
 for(const count of [2,5]){
  const id=crypto.randomUUID();
  expect((await create([{id,blockType:'columns',content:{count},treePosition:'0'},...Array.from({length:count},(_,index)=>({id:crypto.randomUUID(),blockType:'column',content:{},parentBlockId:id,treePosition:String(index+1)}))])).status).toBe(200);
 }
 const nestedId=crypto.randomUUID();
 expect((await create([...blocks,{id:nestedId,blockType:'columns',content:{count:2},parentBlockId:columns[0],treePosition:'90'},...Array.from({length:2},(_,index)=>({id:crypto.randomUUID(),blockType:'column',content:{},parentBlockId:nestedId,treePosition:`9${index+1}`}))])).status).toBe(400);
 const created=await create(blocks);expect(created.status).toBe(200);const pageId=(await created.json<any>()).value.pageId;
 const doc=await json('GET',`/pages/${pageId}`);
 expect(doc.blocks.filter((b:any)=>b.blockType==='column')).toHaveLength(3);
 expect((await request('PATCH',`/pages/${pageId}/blocks/${section}`,{operationKey:crypto.randomUUID(),expectedRevisionId:doc.blocks.find((b:any)=>b.id===section).revisionId,content:{count:2}})).status).toBe(400);
 const archive=async(format:string)=>{const response=await request('POST','/exports/readable',{scope:'page',id:pageId,format,includeComments:false});expect(response.status).toBe(200);return new Uint8Array(await response.arrayBuffer());};
 const importFile=async(format:string,name:string,bytes:Uint8Array)=>{
  const form=new FormData();form.set('file',new File([new Uint8Array(bytes)],name));form.set('format',format);form.set('operationKey',crypto.randomUUID());
  let job=await json('POST','/imports',form);
  if(format==='notion-workspace'||format==='confluence-space'){
   job=await json('POST',`/imports/${job.id}/preview`,{});
   job=await json('POST',`/imports/${job.id}/apply`,{fingerprint:job.report.fingerprint});
   for(let n=0;job.state!=='completed'&&n<15;n++)job=await json('POST',`/imports/${job.id}/resume`,{});
  }else job=await json('POST',`/imports/${job.id}/run`,{});
  expect(job.state).toBe('completed');
 };
 for(const format of ['html','markdown']){
  const bytes=await archive(format),entries=unzipSync(bytes),rendered=new TextDecoder().decode(entries[`pages/${pageId}.${format==='html'?'html':'md'}`]);
  expect(rendered).toContain('data-slate-columns="3"');
  for(const text of ['Plan the response','Assign the lead','Confirm completion'])expect(rendered).toContain(text);
  await importFile('slate-readable',`synthetic-slate-${format}.zip`,bytes);
  // Standalone documents retain layout annotations, in addition to canonical archives.
  await importFile(format,`synthetic-slate-${format}.${format==='html'?'html':'md'}`,strToU8(rendered));
 }
 const word=await request('POST','/exports/readable',{scope:'page',id:pageId,format:'docx',includeComments:false});expect(word.status).toBe(200);
 const documentXml=new TextDecoder().decode(unzipSync(new Uint8Array(await word.arrayBuffer()))['word/document.xml']);
 expect(documentXml.indexOf('Plan the response')).toBeLessThan(documentXml.indexOf('Assign the lead'));
 expect(documentXml.indexOf('Assign the lead')).toBeLessThan(documentXml.indexOf('Confirm completion'));
 const notion='<html><body><div class="column-list"><div class="column"><p>Notion incident plan</p></div><div class="column"><p>Notion incident owner</p></div><div class="column"><p>Notion incident completion</p></div></div></body></html>';
 await importFile('notion-workspace','synthetic-slate-1.zip',zipSync({'Response.html':strToU8(notion)}));
 const layout='<ac:layout><ac:layout-section ac:type="two_equal"><ac:layout-cell><p>Confluence incident plan</p></ac:layout-cell><ac:layout-cell><p>Confluence incident owner</p></ac:layout-cell></ac:layout-section></ac:layout>';
 const csv=(rows:string[][])=>rows.map(row=>row.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(',')).join('\n');
 await importFile('confluence-space','synthetic-slate-2.zip',zipSync({
  'spaces.csv':strToU8(csv([['spaceid','spacename','spacekey'],['1','Incident response','IR']])),
  'content.csv':strToU8(csv([['contentid','contenttype','title','version','prevver','content_status','spaceid','parentid','child_position'],['1','PAGE','Confluence response','1','','current','1','','0']])),
  'bodycontent.csv':strToU8(csv([['bodycontentid','contentid','body','bodytypeid'],['1','1',layout,'2']])),
 }));
 const pages=(await json('GET','/pages')).items;
 const docs=await Promise.all(pages.map((page:any)=>json('GET',`/pages/${page.id}`)));
 for(const [text,count] of [['Notion incident plan',3],['Confluence incident plan',2]] as const){
  const imported=docs.find(d=>JSON.stringify(d.blocks).includes(text));expect(imported,text).toBeDefined();
  const group=imported.blocks.find((b:any)=>b.blockType==='columns');expect(group.content.count).toBe(count);
  expect(imported.blocks.filter((b:any)=>b.parentBlockId===group.id&&b.blockType==='column')).toHaveLength(count);
 }
 expect(docs.filter(d=>d.blocks.some((b:any)=>b.blockType==='columns'&&b.content.count===3))).toHaveLength(6);
}
