import type { FeatureContext } from '../../app/feature-context';
import { indexDocuments } from './index-documents';
import { searchTextRows } from './text-rows';

/** A transactional dirty marker survives failed/crashed refreshes. No permission is indexed. */
export async function refreshSearchIndex(ctx:FeatureContext):Promise<number> {
 let refreshed=0;
 // Bound canonical projection and serialization while amortizing native bridge
 // crossings across bulk imports. Every key still carries its own generation.
 for (;;) {
  const dirty=(await ctx.db.prepare('SELECT key,generation FROM search_dirty WHERE workspace_id=? LIMIT 1000').bind(ctx.actor.workspaceId).all<{key:string;generation:string}>()).results;
  if(!dirty.length)return refreshed;
  const {rows,published}=await indexDocuments(ctx,dirty.map(d=>d.key));
  const byKey=new Map(rows.map(r=>[`${r.kind}:${r.id}`,r]));
  const entries=[];
  for(const d of dirty){
   const row=byKey.get(d.key);if(!row)continue;
   const revision=row.pageId?published.get(row.pageId):undefined;
   entries.push(...searchTextRows(row,ctx.actor.workspaceId,revision).map(r=>({...r,generation:d.generation})));
  }
  const markers=JSON.stringify(dirty),columns=['key','variant','workspace_id','kind','id','page_id','title','text','title_fold','text_fold','document_json','container_id','status','lifecycle','archived_at','trashed_at','author_id','updated_at','contributors_json'];
  await ctx.db.batch([
   ctx.db.prepare("DELETE FROM search_text WHERE key IN (SELECT d.key FROM search_dirty d JOIN json_each(?) j ON d.key=json_extract(j.value,'$.key') AND d.generation=json_extract(j.value,'$.generation'))").bind(markers),
   ctx.db.prepare(`INSERT INTO search_text (${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(j.value,'$.${c}')`).join(',')} FROM json_each(?) j JOIN search_dirty d ON d.key=json_extract(j.value,'$.key') AND d.generation=json_extract(j.value,'$.generation')`).bind(JSON.stringify(entries)),
   ctx.db.prepare("DELETE FROM search_dirty WHERE (key,generation) IN (SELECT json_extract(value,'$.key'),json_extract(value,'$.generation') FROM json_each(?))").bind(markers),
  ]);refreshed+=dirty.length;
 }
}
