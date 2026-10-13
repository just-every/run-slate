import {PDFDocument,rgb,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import noto from './assets/noto-sans-base64.txt?raw';
import symbols from './assets/noto-symbols-base64.txt?raw';
import {ApiProblem} from '../../app/problems';
const bytes=(source:string)=>Uint8Array.from(atob(source.trim()),c=>c.charCodeAt(0));
/** Embedded OFL fonts preserve selectable Unicode; unsupported characters fail rather than become '?'. */
export async function renderPdf(title:string,body:string){const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const fonts=await Promise.all([doc.embedFont(bytes(noto),{subset:true}),doc.embedFont(bytes(symbols),{subset:true})]);const sets=fonts.map(font=>new Set(font.getCharacterSet()));const choose=(char:string):PDFFont=>{const i=sets.findIndex(set=>set.has(char.codePointAt(0)!));if(i<0)throw new ApiProblem(422,'PDF_GLYPH_UNAVAILABLE','A character is outside the embedded PDF fonts. Export HTML or install an appropriate font for this language.');return fonts[i]!;};doc.setTitle(title);let page=doc.addPage([612,792]),x=40,y=750;for(const char of title+'\n\n'+body){if(char==='\r')continue;if(char==='\n'){x=40;y-=15;}else{const printable=char==='\t'?' ':char,font=choose(printable),width=font.widthOfTextAtSize(printable,10);if(x+width>572){x=40;y-=15;}if(y<40){page=doc.addPage([612,792]);y=750;}page.drawText(printable,{x,y,size:10,font,color:rgb(0,0,0)});x+=width;}if(y<40){page=doc.addPage([612,792]);y=750;}}return doc.save();}
