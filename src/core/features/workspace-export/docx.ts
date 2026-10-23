import {layoutOrder} from '../editor/layout';
import { strToU8, zipSync } from 'fflate';
import type { FeatureContext } from '../../app/feature-context';
import type { BlockView } from '../../shared/api/content';
import { readPage } from '../pages/service';
import { exportComments } from './comments';
import { WordComments } from './docx-comments';
import { bookmark, wordBlock, type WordContentContext } from './docx-content';
import { wordImages, wordDrawing } from './docx-media';
import { contentTypesXml, stylesXml, numberingXml, listDefinition } from './docx-parts';
import { declaration, wordNamespace, relationshipNamespace, paragraph, run, relation, relationshipsXml } from './docx-xml';

/** All reads use the caller's authorization context. The readable export entry
 * point checks its original ACL epoch after this package is fully assembled. */
export async function renderDocx(ctx:FeatureContext, ids:ReadonlySet<string>, excluded:ReadonlySet<string>, origin:string, includeComments:boolean):Promise<Uint8Array> {
  const pages=[];
  const comments=new WordComments();
  const bookmarks=new Map<string,{id:number;name:string}>();
  const anchor=(id:string)=>{const n=bookmarks.size+1;bookmarks.set(id,{id:n,name:`slate_${n}`});};
  for(const id of ids) {
    const page=await readPage(ctx,id);
    pages.push(page);anchor(id);page.blocks.forEach(block=>anchor(block.id));
    if(includeComments)comments.add(id,await exportComments(ctx,id,page.blocks,['edit','full'].includes(page.permissions.level)));
  }
  const blocks=pages.flatMap(page=>page.blocks);
  const images=await wordImages(ctx,blocks);
  const names=new Map<string,string>();
  for(const block of blocks) {
    const content=block.content as {assigneeMemberId?:string};
    if(block.blockType==='task'&&content.assigneeMemberId&&!names.has(content.assigneeMemberId)) {
      const member=await ctx.db.prepare('SELECT display_name FROM members WHERE id=? AND workspace_id=?').bind(content.assigneeMemberId,ctx.actor.workspaceId).first<{display_name:string}>();
      if(member)names.set(content.assigneeMemberId,member.display_name);
    }
  }
  const numbers:string[]=[];
  const relations=[relation('styles','styles','styles.xml'),relation('numbering','numbering','numbering.xml')];
  for(const image of images.values())relations.push(relation(image.relationship,'image',image.path));
  const links=new Map<string,string>();
  let drawingId=0;
  const body=pages.map((page,index)=>{
    const context:WordContentContext={origin,pageId:page.page.id,bookmarks,excluded,comments,memberNames:names,
      image:(block:BlockView)=>wordDrawing(block,images,++drawingId),
      list:(variant,start)=>{const id=numbers.length+1;numbers.push(listDefinition(id,variant,start));return id;},
      hyperlink:(url,content)=>{
        let id=links.get(url);
        if(!id){id=`link${links.size+1}`;links.set(url,id);relations.push(relation(id,'hyperlink',url,true));}
        return `<w:hyperlink r:id="${id}">${content}</w:hyperlink>`;
      },
    };
    return paragraph(comments.mark(page.page.id,bookmark(context,page.page.id,run(page.page.title))),`<w:pStyle w:val="Title"/>${index?'<w:pageBreakBefore/>':''}`)+layoutOrder(page.blocks).filter(block=>!['columns','column'].includes(block.blockType)).map(block=>wordBlock(block,page.blocks,context)).join('');
  }).join('');
  const entries:Record<string,Uint8Array>={};
  const put=(path:string,text:string)=>{entries[path]=strToU8(text);};
  put('word/document.xml',`${declaration}<w:document xmlns:w="${wordNamespace}" xmlns:r="${relationshipNamespace}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:slate="urn:slate:docx" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="slate"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  put('word/styles.xml',stylesXml);put('word/numbering.xml',numberingXml(numbers));
  if(comments.present){
    put('word/comments.xml',comments.xml);put('word/commentsExtended.xml',comments.extendedXml);
    relations.push(relation('comments','comments','comments.xml'));
    relations.push('<Relationship Id="commentsExtended" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>');
  }
  for(const image of images.values())entries[`word/${image.path}`]=image.bytes;
  put('[Content_Types].xml',contentTypesXml(new Map([...images.values()].map(image=>[image.extension,image.type])),comments.present));
  put('_rels/.rels',relationshipsXml([relation('document','officeDocument','word/document.xml')]));
  put('word/_rels/document.xml.rels',relationshipsXml(relations));
  return zipSync(entries,{level:1});
}
