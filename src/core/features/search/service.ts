import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requestHash } from '../../app/operations';
import { createUlid } from '../../shared/ulid';
import { currentSubject } from '../sharing/current-access';
import { type SearchDocument } from './documents';
import { refreshSearchIndex } from './index';
import { searchQuery } from './query';
import { decodeCursor,encodeCursor,limitValue } from './pagination';
export interface SearchInput { query:string; kind?:string; containerId?:string; contributorId?:string; status?:string; updatedFrom?:string; updatedTo?:string; includeArchived?:boolean; includeTrashed?:boolean; limit?:number; cursor?:string }
export interface SearchResult extends Omit<SearchDocument,'text'|'contributors'> { snippet:string; highlights:string[]; href:string; score:number }
const allowedKinds=['page','record','container','template','comment-thread'];
export function validateSearch(input:SearchInput):SearchInput {
  if(!input||typeof input.query!=='string'||input.query.length>1000)throw new ApiProblem(400,'INVALID_QUERY','Query must contain at most 1000 characters.');
  if(input.kind&&!allowedKinds.includes(input.kind))throw new ApiProblem(400,'INVALID_KIND','Unknown search kind.');
  for(const value of [input.updatedFrom,input.updatedTo])if(value&&!Number.isFinite(Date.parse(value)))throw new ApiProblem(400,'INVALID_DATE','Invalid date filter.');
  return {...input,query:input.query.trim(),limit:limitValue(input.limit)};
}
export function queryTerms(query:string):string[] { return Array.from(query.matchAll(/"([^"\n]+)"|(\S+)/g),m=>(m[1]??m[2]).toLocaleLowerCase()); }
function result(row:SearchDocument,terms:string[]):SearchResult {
  const text=row.text;const position=Math.max(0,text.toLocaleLowerCase().indexOf(terms[0]??''));const from=Math.max(0,position-65);
  const {text:_,contributors:__,...rest}=row;
  return {...rest,snippet:(from?'…':'')+text.slice(from,from+220)+(text.length>from+220?'…':''),highlights:terms,href:row.kind==='container'?`/app/containers/${row.id}`:row.kind==='template'?`/app/templates/${row.id}`:`/app/pages/${row.pageId}${row.kind==='comment-thread'?`?thread=${row.id}`:''}`,score:terms.reduce((n,t)=>n+(row.title.toLocaleLowerCase()===t?20:row.title.toLocaleLowerCase().includes(t)?10:1),0)};
}
export async function search(ctx:FeatureContext,raw:SearchInput) {
  const subject=await currentSubject(ctx),input=validateSearch(raw),terms=queryTerms(input.query);
  const {cursor:_,limit:__,...filters}=input;
  const queryHash=await requestHash(filters),cursor=decodeCursor<{snapshot:string;offset:number}>(input.cursor);
  if(cursor&&(typeof cursor.snapshot!=='string'||!Number.isInteger(cursor.offset)||cursor.offset<0))throw new ApiProblem(400,'INVALID_CURSOR','Invalid search cursor.');
  const snapshotId=cursor?.snapshot??createUlid();
  if(cursor&&!await ctx.db.prepare('SELECT 1 FROM discovery_snapshots WHERE id=? AND workspace_id=? AND member_id=? AND query_hash=? AND expires_at>?').bind(snapshotId,ctx.actor.workspaceId,ctx.actor.id,queryHash,ctx.now).first())throw new ApiProblem(409,'SEARCH_EXPIRED','Search changed or expired. Start a fresh search.');
  await refreshSearchIndex(ctx);
  const query=await searchQuery(ctx,subject,input,terms,cursor?snapshotId:undefined);
  if(!cursor) {
    const n=query.values.length;
    // Keep one visible set; snapshot IDs require a full sort, but the first page
    // needs only a bounded sort, not a second materialized window over every hit.
    const summary=await ctx.db.prepare(query.sql+`
      INSERT INTO discovery_snapshots(id,workspace_id,member_id,query_hash,ids_json,expires_at,search_summary_json)
      SELECT ?${n+1},?${n+2},?${n+3},?${n+4},(SELECT json_group_array(key) FROM (SELECT key FROM visible ORDER BY score DESC,updatedAt DESC,id ASC)),?${n+5},json_object(
       'total',(SELECT COUNT(*) FROM visible),
       'items',json((SELECT json_group_array(json_set(document_json,'$.status',status)) FROM (SELECT COALESCE(document_json,(SELECT t.document_json FROM search_text t WHERE t.key=visible.key AND t.variant=visible.variant)) AS document_json,status FROM visible ORDER BY score DESC,updatedAt DESC,id ASC LIMIT ?${n+6}))),
       'kind',json((SELECT json_group_object(kind,n) FROM (SELECT kind,COUNT(*) n FROM visible GROUP BY kind))),
       'container',json((SELECT json_group_object(containerId,n) FROM (SELECT containerId,COUNT(*) n FROM visible WHERE containerId IS NOT NULL GROUP BY containerId))),
       'status',json((SELECT json_group_object(status,n) FROM (SELECT status,COUNT(*) n FROM visible WHERE status IS NOT NULL GROUP BY status))))
      WHERE ${query.ready}
      RETURNING search_summary_json`).bind(...query.values,snapshotId,ctx.actor.workspaceId,ctx.actor.id,queryHash,new Date(Date.parse(ctx.now)+3600000).toISOString(),input.limit!).first<{search_summary_json:string}>();
    if(!summary)throw new ApiProblem(409,'SEARCH_CHANGED','Content or access changed during search. Start a fresh search.');
    const data=JSON.parse(summary.search_summary_json) as {total:number;items:SearchDocument[];kind:Record<string,number>;container:Record<string,number>;status:Record<string,number>};
    return {items:data.items.map(r=>result(r,terms)),total:data.total,facets:{kind:data.kind,container:data.container,status:data.status},filters,nextCursor:data.total>data.items.length?encodeCursor({snapshot:snapshotId,offset:data.items.length}):undefined};
  }
  const parameter=query.values.length;
  const data=await ctx.db.prepare(query.sql+`, ordered AS MATERIALIZED (SELECT v.*,CAST(s.key AS INTEGER) AS position FROM visible v JOIN discovery_snapshots snap ON snap.id=?${parameter+1} JOIN json_each(snap.ids_json) s ON s.value=v.key), selected AS (SELECT * FROM ordered WHERE position>=?${parameter+2} ORDER BY position LIMIT ?${parameter+3})
    SELECT (SELECT COUNT(*) FROM ordered) AS total,
    (SELECT COUNT(*) FROM ordered WHERE position>=?${parameter+2}) AS remaining,
    (SELECT json_group_array(json_object('document',json_set(COALESCE(document_json,(SELECT t.document_json FROM search_text t WHERE t.key=selected.key AND t.variant=selected.variant)),'$.status',status),'position',position)) FROM selected) AS items,
    (SELECT json_group_object(kind,n) FROM (SELECT kind,COUNT(*) n FROM ordered GROUP BY kind)) AS kinds,
    (SELECT json_group_object(containerId,n) FROM (SELECT containerId,COUNT(*) n FROM ordered WHERE containerId IS NOT NULL GROUP BY containerId)) AS containers,
    (SELECT json_group_object(status,n) FROM (SELECT status,COUNT(*) n FROM ordered WHERE status IS NOT NULL GROUP BY status)) AS statuses WHERE ${query.ready}`).bind(...query.values,snapshotId,cursor?.offset??0,input.limit!).first<{total:number;remaining:number;items:string;kinds:string;containers:string;statuses:string}>();
  if(!data)throw new ApiProblem(409,'SEARCH_CHANGED','Content or access changed during search. Start a fresh search.');
  const selected=JSON.parse(data.items) as {document:SearchDocument;position:number}[];
  return {items:selected.map(r=>result(r.document,terms)),total:data!.total,facets:{kind:JSON.parse(data!.kinds),container:JSON.parse(data!.containers),status:JSON.parse(data!.statuses)},filters,nextCursor:data!.remaining>selected.length?encodeCursor({snapshot:snapshotId,offset:selected.at(-1)!.position+1}):undefined};
}
/** Import completion proves every requested canonical ID has a clean indexed generation. */
export async function verifySearchable(ctx:FeatureContext,pageIds:string[],bounds?:import('./index').SearchRefreshBounds) {
 await refreshSearchIndex(ctx,bounds);
 return !!await ctx.db.prepare("SELECT NOT EXISTS(SELECT 1 FROM json_each(?) i WHERE NOT EXISTS(SELECT 1 FROM search_text s WHERE s.workspace_id=? AND s.page_id=i.value) OR EXISTS(SELECT 1 FROM search_dirty d WHERE d.workspace_id=? AND d.key IN ('page:'||i.value,'record:'||i.value))) AS ready").bind(JSON.stringify(pageIds),ctx.actor.workspaceId,ctx.actor.workspaceId).first<number>('ready');
}
