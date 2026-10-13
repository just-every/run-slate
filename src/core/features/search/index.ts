import type { FeatureContext } from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import { indexDocuments } from './index-documents';
import { searchTextRows } from './text-rows';

export interface SearchRefreshBounds {maxBatches?:number;keyLimit?:number}
/** Every dirty generation is removed atomically with its complete canonical
 * projection. Callers may yield between batches; ordinary search still drains. */
export async function refreshSearchIndex(ctx:FeatureContext,bounds:SearchRefreshBounds={}):Promise<number> {
 let refreshed=0,batches=0;const encoder=new TextEncoder(),limit=Math.max(1,Math.min(100,bounds.keyLimit??100));
 const columns=['key','variant','workspace_id','kind','id','page_id','title','text','title_fold','text_fold','tokens','record_shared','document_json','container_id','status','lifecycle','archived_at','trashed_at','author_id','updated_at','contributors_json'];
 while(batches<(bounds.maxBatches??Infinity)) {
  const dirty=(await ctx.db.prepare('SELECT key,generation FROM search_dirty WHERE workspace_id=? LIMIT ?').bind(ctx.actor.workspaceId,limit).all<{key:string;generation:string}>()).results;
  if(!dirty.length)return refreshed;
  const {rows,published,records}=await indexDocuments(ctx,dirty.map(d=>d.key));
  const byKey=new Map(rows.map(r=>[`${r.kind}:${r.id}`,r]));
  let markers:string[]=[],entries:string[]=[],bytes=6;
  for(const d of dirty){
   const row=byKey.get(d.key),revision=row?.pageId?published.get(row.pageId):undefined;
   const projected=row?searchTextRows(row,ctx.actor.workspaceId,revision,records.get(row.id)).map(r=>JSON.stringify({...r,generation:d.generation})):[];
   const marker=JSON.stringify(d),size=2*(encoder.encode(marker).length+1)+projected.reduce((sum,item)=>sum+encoder.encode(item).length+1,0);
   // Each batch binds the generation markers twice and the projection once.
   // A whole key stays together, including working/published variants.
   if(bytes+size>2_000_000){if(markers.length)break;throw new ApiProblem(413,'SEARCH_DOCUMENT_TOO_LARGE','A complete canonical search document exceeds the database transport limit. Its dirty generation remains available for recovery.');}
   markers.push(marker);entries.push(...projected);bytes+=size;
  }
  const markerJson=`[${markers.join(',')}]`,entryJson=`[${entries.join(',')}]`;
  await ctx.db.batch([
   ctx.db.prepare("DELETE FROM search_text WHERE key IN (SELECT d.key FROM search_dirty d JOIN json_each(?) j ON d.key=json_extract(j.value,'$.key') AND d.generation=json_extract(j.value,'$.generation'))").bind(markerJson),
   ctx.db.prepare(`INSERT INTO search_text (${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(j.value,'$.${c}')`).join(',')} FROM json_each(?) j JOIN search_dirty d ON d.key=json_extract(j.value,'$.key') AND d.generation=json_extract(j.value,'$.generation')`).bind(entryJson),
   ctx.db.prepare("DELETE FROM search_dirty WHERE (key,generation) IN (SELECT json_extract(value,'$.key'),json_extract(value,'$.generation') FROM json_each(?))").bind(markerJson),
  ]);refreshed+=markers.length;batches++;
 }
 return refreshed;
}
