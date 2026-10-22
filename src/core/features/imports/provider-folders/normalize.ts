import {parseImport} from '../service';
import type {ImportedBlock,ImportedPage,NormalizedImport} from '../types';
import type {FolderAdapter,FolderReport,ProviderItem} from './types';
import {ApiProblem} from '../../../app/problems';
export function folderPage(item:ProviderItem,parentSourceId?:string):ImportedPage{return {sourceId:item.id,sourceIdentityKind:'native',containerSourceId:'folder-import',parentSourceId,title:item.name,blocks:[],lifecycle:'live',labels:[],properties:item.version?{sourceRevision:item.version}:{},restricted:true,grants:[],revisions:[]};}
function rekey<T>(value:T,prefix:string,ids:Set<string>,root:string,target:string):T {
 const identityKeys=new Set(['sourceId','id','parentSourceId','containerSourceId','mediaSourceId','targetSourceId','fileId','parentBlockId','ancestorPageSourceId']);
 const mapped=(id:string)=>id===root?target:prefix+id;
 function visit(value:unknown,key?:string):unknown{if(typeof value==='string'){if(identityKeys.has(key??'')&&ids.has(value))return mapped(value);if(value.startsWith('/api/media/')&&ids.has(value.slice(11)))return '/api/media/'+mapped(value.slice(11));if(value.startsWith('/app/pages/')&&ids.has(value.slice(11)))return '/app/pages/'+mapped(value.slice(11));return value;}if(value instanceof Uint8Array)return value;if(Array.isArray(value))return value.map(v=>visit(v,key));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)]));return value;}return visit(value) as T;
}
export async function normalizeDocument(adapter:FolderAdapter,item:ProviderItem,parentSourceId:string,report:FolderReport):Promise<NormalizedImport>{
 const source=await adapter.download(item),parsed=parseImport(source.format,source);
 if(source.format==='pdf'&&parsed.report.unmapped.length)throw new ApiProblem(422,'FOLDER_PDF_UNSUPPORTED',parsed.report.unmapped.map(entry=>entry.label).join('; '));
 const ids=new Set<string>();const collect=(value:unknown)=>{if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object'&&!(value instanceof Uint8Array))for(const [key,part]of Object.entries(value)){if((key==='sourceId'||key==='id')&&typeof part==='string')ids.add(part);collect(part);}};collect(parsed);
 const renamed=rekey(parsed,`${item.id}:`,ids,parsed.pages[0]!.sourceId,item.id),page=renamed.pages[0]!;
 page.sourceId=item.id;page.sourceIdentityKind='native';page.parentSourceId=parentSourceId;page.containerSourceId='folder-import';page.title=item.name.replace(/\.(?:docx|pdf)$/i,'');page.properties=item.version?{sourceRevision:item.version}:{};page.restricted=true;page.grants=[];
 for(const page of renamed.pages.slice(1)){page.containerSourceId='folder-import';page.restricted=true;page.grants=[];page.parentSourceId=item.id;}
 page.blocks.push({sourceId:`${item.id}:original`,sourceIdentityKind:'native',kind:'paragraph',text:'Original document',links:[{href:item.url,kind:'external',textStart:0,textEnd:17}],children:[]});
 for(const entry of [...parsed.report.unmapped,...parsed.report.warnings])report.warnings.push({sourceId:item.id,name:item.name,url:item.url,reason:entry.label,detail:entry.detail});
 return renamed;
}
export function resolveFolderLinks(parsed:NormalizedImport,items:ProviderItem[],report:FolderReport){
 const pages=new Set(parsed.pages.map(page=>page.sourceId));
 const byUrl=new Map(items.map(item=>[item.url.split('#')[0]!,item.id]));
 const byName=new Map<string,string[]>();for(const item of items){const name=item.name.toLowerCase();byName.set(name,[...(byName.get(name)??[]),item.id]);}
 const find=(href:string)=>{let url:URL|undefined;try{url=new URL(href);}catch{}if(url){const exact=byUrl.get(url.href.split('#')[0]!);if(exact)return exact;if(['docs.google.com','drive.google.com'].includes(url.hostname))return url.pathname.match(/\/(?:d|folders)\/([^/]+)/)?.[1]??url.searchParams.get('id')??undefined;return undefined;}let name:string;try{name=decodeURIComponent(href.split(/[?#]/)[0]!.split('/').at(-1)??'').toLowerCase();}catch{return undefined;}const candidates=byName.get(name);return candidates?.length===1?candidates[0]:undefined;};
 function visit(blocks:ImportedBlock[],page:ImportedPage){for(const block of blocks){for(const link of block.links){if(link.href===page.blocks.at(-1)?.links[0]?.href&&block.sourceId===`${page.sourceId}:original`)continue;const id=find(link.href);if(id&&pages.has(id)){link.targetSourceId=id;link.kind='page';}else if(id)report.warnings.push({sourceId:page.sourceId,name:page.title,url:link.href,reason:'Linked document was not imported; original provider link retained.'});}visit(block.children,page);}}
 for(const page of parsed.pages)visit(page.blocks,page);
}
