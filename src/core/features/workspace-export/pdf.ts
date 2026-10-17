import {PDFDocument,PDFName,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import noto from './assets/noto-sans-base64.txt?raw';
import symbols from './assets/noto-symbols-base64.txt?raw';
import {ApiProblem} from '../../app/problems';
import type {PdfLine} from './pdf-content';
const bytes=(source:string)=>Uint8Array.from(atob(source.trim()),c=>c.charCodeAt(0));
/** Embedded OFL fonts preserve selectable Unicode; unsupported characters fail rather than become '?'. */
export async function renderPdf(title:string,body:PdfLine[]){
 const doc=await PDFDocument.create();
 doc.registerFontkit(fontkit);
 const fonts=await Promise.all([doc.embedFont(bytes(noto),{subset:true}),doc.embedFont(bytes(symbols),{subset:true})]);
 const sets=fonts.map(font=>new Set(font.getCharacterSet()));
 const choose=(char:string):PDFFont=>{const i=sets.findIndex(set=>set.has(char.codePointAt(0)!));if(i<0)throw new ApiProblem(422,'PDF_GLYPH_UNAVAILABLE','A character is outside the embedded PDF fonts. Export HTML or install an appropriate font for this language.');return fonts[i]!;};
 doc.setTitle(title);
 let page=doc.addPage([612,792]),y=750;
 const anchors=new Map<string,{page:PDFPage;y:number}>();
 const links:{page:PDFPage;href:string;rect:number[]}[]=[];
 const nextPage=()=>{if(y<40){page=doc.addPage([612,792]);y=750;}};
 for(const line of [{text:title},{text:''},...body]){
  nextPage();
  const left=40+(line.depth??0)*16;
  let x=left;
  if(line.anchor)anchors.set(line.anchor,{page,y});
  const finishLink=()=>{if(line.href&&x>left)links.push({page,href:line.href,rect:[left,y-2,x,y+11]});};
  for(const char of line.text){
   if(char==='\r')continue;
   if(char==='\n'){finishLink();x=left;y-=15;nextPage();continue;}
   const printable=char==='\t'?' ':char,font=choose(printable),width=font.widthOfTextAtSize(printable,10);
   if(x+width>572){finishLink();x=left;y-=15;nextPage();}
   page.drawText(printable,{x,y,size:10,font,color:line.href?rgb(0.1,0.25,0.55):rgb(0,0,0)});
   x+=width;
  }
  finishLink();y-=15;
 }
 // Resolve after layout, so a TOC before its headings points to their actual pages.
 for(const link of links){
  const target=anchors.get(decodeURIComponent(link.href.slice(1)));
  if(!target)throw new ApiProblem(422,'PDF_DESTINATION_MISSING','A table-of-contents heading has no PDF destination.');
  const annotation=doc.context.obj({Type:'Annot',Subtype:'Link',Rect:link.rect,Border:[0,0,0],Dest:[target.page.ref,PDFName.of('XYZ'),40,target.y+12,null]});
  link.page.node.addAnnot(doc.context.register(annotation));
 }
 return doc.save();
}
