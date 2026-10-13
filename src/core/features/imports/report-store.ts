import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';

export interface ReportSection {prefix:string;count:number;pages:number}
const encoder=new TextEncoder();
/** Destination candidates are live workspace directory data, not import
 * custody. Discard older snapshots before a report is read or written again. */
export function retainedImportReport(serialized:string) {
 const report=JSON.parse(serialized);delete report.candidates;return report;
}
/** Reports retain every item in immutable R2 pages. The durable job and each
 * progress response carry only one small page and constant-size section counts. */
export async function storeReportSection(ctx:FeatureContext,importId:string,prefix:string,items:unknown[],startPage=0) {
 const chunks:unknown[][]=[];let page:unknown[]=[],bytes=2,first:unknown[]=[];
 const flush=()=>{if(!page.length)return;if(!chunks.length&&bytes<=65536)first=page;chunks.push(page);page=[];bytes=2;};
 for(const item of items){const size=encoder.encode(JSON.stringify(item)).byteLength+1;if(page.length&&(page.length>=50||bytes+size>65536))flush();page.push(item);bytes+=size;}flush();
 const keys=chunks.map((_,index)=>`${prefix}/${startPage+index}`);
 if(keys.length){
  await ctx.db.batch([mutationGuard(ctx.db,"SELECT actor_id=? AND state!='deleted' FROM federation_imports WHERE id=?",[ctx.actor.id,importId]),ctx.db.prepare("INSERT INTO import_objects(import_id,storage_key,kind,available) SELECT ?,value,'report',0 FROM json_each(?) WHERE 1 ON CONFLICT DO NOTHING").bind(importId,JSON.stringify(keys))]);
  try{
   for(let index=0;index<chunks.length;index++)await ctx.files.put(keys[index]!,JSON.stringify(chunks[index]),{httpMetadata:{contentType:'application/json'}});
   await ctx.db.batch([mutationGuard(ctx.db,"SELECT actor_id=? AND state!='deleted' FROM federation_imports WHERE id=?",[ctx.actor.id,importId]),ctx.db.prepare('UPDATE import_objects SET available=1 WHERE import_id=? AND storage_key IN (SELECT value FROM json_each(?))').bind(importId,JSON.stringify(keys))]);
  }catch(error){for(const key of keys)await ctx.files.delete(key);throw error;}
 }
 return {section:{prefix,count:items.length,pages:startPage+chunks.length},first,keys};
}
export async function readReportSection(ctx:FeatureContext,report:Record<string,unknown>,kind:string,page:number) {
 const section=(report.sections as Record<string,ReportSection>|undefined)?.[kind];
 if(!section||page<0||page>=section.pages)throw new ApiProblem(404,'NOT_FOUND','That report page does not exist.');
 const object=await ctx.files.get(`${section.prefix}/${page}`);if(!object)throw new ApiProblem(409,'IMPORT_REPORT_MISSING','The retained report page is missing.');
 return {items:await object.json<unknown[]>(),page,pages:section.pages,total:section.count};
}
