import {ApiProblem} from '../../../app/problems';
import type {FolderAdapter,FolderReport,ProviderItem} from './types';
import type {NormalizedImport} from '../types';
import {folderPage,normalizeDocument,resolveFolderLinks} from './normalize';
export async function collectFolder(adapter:FolderAdapter,rootId:string,report:FolderReport){
 const root=await adapter.item(rootId);if(!root.folder||!root.readable)throw new ApiProblem(403,'FOLDER_SOURCE_UNREADABLE','The selected folder is not readable.');
 const parsed:NormalizedImport={format:'docx',sourceName:root.name,containers:[{sourceId:'folder-import',sourceIdentityKind:'native',name:root.name,personal:false,labels:[],grants:[]}],members:[],pages:[folderPage(root)],databases:[],records:[],media:[],report:{created:[],warnings:[],unmapped:[]}};
 const items:ProviderItem[]=[root],seen=new Set([root.id]);let bytes=0,documents=0;
 const reason=(error:unknown)=>error instanceof ApiProblem?{reason:error.code,detail:error.message}:{reason:'FOLDER_FILE_INVALID',detail:'The source document could not be parsed.'};
 async function visit(folder:ProviderItem,depth:number){if(depth>20)throw new ApiProblem(413,'FOLDER_TOO_DEEP','The folder exceeds 20 nested levels.');report.folders++;let children:ProviderItem[];try{children=await adapter.children(folder.id);}catch(error){report.notImported.push({sourceId:folder.id,name:folder.name,url:folder.url,...reason(error)});return;}
  for(const listed of children){if(seen.has(listed.id)){report.notImported.push({sourceId:listed.id,name:listed.name,url:listed.url,reason:'FOLDER_DUPLICATE_OR_CYCLE'});continue;}seen.add(listed.id);if(seen.size>2000)throw new ApiProblem(413,'FOLDER_TOO_LARGE','A folder import supports up to 2,000 items.');items.push(listed);
   if(!listed.readable){report.notImported.push({sourceId:listed.id,name:listed.name,url:listed.url,reason:'FOLDER_SOURCE_UNREADABLE'});continue;}
   try{const item=await adapter.item(listed.id);if(!item.readable||item.folder!==listed.folder)throw new ApiProblem(403,'FOLDER_SOURCE_UNREADABLE','The item is no longer readable.');if(item.folder){parsed.pages.push(folderPage(item,folder.id));await visit(item,depth+1);continue;}if(++documents>100)throw new ApiProblem(413,'FOLDER_DOCUMENT_LIMIT','A folder import supports up to 100 documents.');const document=await normalizeDocument(adapter,item,folder.id,report);const after=await adapter.item(item.id);if(!after.readable||item.version!==after.version)throw new ApiProblem(409,'FOLDER_SOURCE_CHANGED','The document changed while being read.');bytes+=document.media.reduce((n,m)=>n+m.bytes.length,0)+document.pages.reduce((n,p)=>n+JSON.stringify(p.blocks).length,0);if(bytes>128*1024*1024)throw new ApiProblem(413,'FOLDER_TOO_LARGE','The imported content exceeds 128 MiB.');parsed.pages.push(...document.pages);parsed.media.push(...document.media);report.imported.push({sourceId:item.id,name:item.name,url:item.url});
   }catch(error){report.notImported.push({sourceId:listed.id,name:listed.name,url:listed.url,...reason(error)});}
  }
 }
 await visit(root,0);resolveFolderLinks(parsed,items,report);report.tree=parsed.pages.map(page=>({sourceId:page.sourceId,parentSourceId:page.parentSourceId,title:page.title,folder:!report.imported.some(item=>item.sourceId===page.sourceId)}));parsed.report.created=parsed.pages.map(page=>({kind:'page',sourceId:page.sourceId,label:page.title}));return parsed;
}
