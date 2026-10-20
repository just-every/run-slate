import type { BlockInput } from '../../../src/core/features/pages/types';
export const imageBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
export const imageAlt = 'Recovery chart <image> & "owner"';
export const table = {
  columns:['Phase','Owner','Outcome'],
  rows:[{id:'row-1',cells:['Plan <one>','Shared & covered','Ready']},{id:'row-2',cells:['Continued','0','Shipped']},{id:'row-3',cells:['Review','Morgan','Stable']}],
  merges:[{rowId:'row-1',column:0,rowSpan:2,colSpan:2}],
};
export function wordBlocks(file:{id:string;url:string;name:string;contentType:string},assignee:string,child:string,other:string):BlockInput[] {
  const blocks:BlockInput[]=[];
  const add=(type:string,content:BlockInput['content'])=>{const block={id:crypto.randomUUID(),blockType:type,content,treePosition:String(blocks.length).padStart(6,'0')};blocks.push(block);return block;};
  add('table-of-contents',{minLevel:1,maxLevel:3,style:'nested'});
  add('heading',{level:1,text:[{text:'Recovery <guide> & ownership'}]});
  add('heading',{level:2,text:[{text:'Handover checkpoints'}]});
  add('heading',{level:3,text:[{text:'Final confirmation'}]});
  add('paragraph',{text:[{text:'Read the follow-up',link:{href:`/app/pages/${child}`}},{text:' or the reference',link:{href:`/app/pages/${other}`}},{text:' and external guidance',link:{href:'https://example.org/guide'}},{text:' <script>alert("xml")</script> & escaped',marks:['bold','italic','underline','strikethrough']}]});
  for(const variant of ['bulleted','numbered','toggle'])add('list',{variant,start:3,items:[{id:crypto.randomUUID(),text:[{text:`${variant} item`}],open:true,detail:[{text:'Toggle detail & next step'}]}]});
  add('task',{text:[{text:'Confirm recovery owner'}],done:true,assigneeMemberId:assignee,dueDate:'2026-11-03'});
  add('table',table);
  add('code',{language:'typescript',code:'if (ready < 2 && owner) {\n  confirm("recovery");\n}'});
  add('callout',{text:[{text:'Callout <take care> & confirm'}],tone:'warn',icon:'!'});
  add('quote',{text:[{text:'Customer context'}],attribution:'Support team'});
  add('divider',{});
  add('expandable',{summary:'Detailed plan',open:true,content:[{text:'All recovery details'}]});
  add('media',{kind:'image',source:{url:file.url,name:file.name,fileId:file.id,contentType:file.contentType},caption:'Recovery evidence',alt:imageAlt});
  add('media',{kind:'image',source:{url:file.url,name:file.name,fileId:file.id,contentType:file.contentType},caption:'Second view',alt:'Same image, distinct alt'});
  add('link-card',{url:`/app/pages/${child}`,display:'plain',previewState:'refused'});
  return blocks;
}
