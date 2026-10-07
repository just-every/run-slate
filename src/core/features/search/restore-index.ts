import type { SearchDocument } from './documents';
import { retainedText } from './documents';
import {searchTextRows} from './text-rows';

type Row=Record<string,string|number|null>;
/** Pure preparation: append after canonical inserts in the SAME restore transaction. */
export function prepareSearchRestoreStatements(db:D1Database,tables:Record<string,Row[]>):D1PreparedStatement[] {
 const result:D1PreparedStatement[]=[],pages=new Map((tables.pages??[]).map(r=>[r.id,r])),revisions=new Map((tables.page_revisions??[]).filter(r=>!r.deleted_at).map(r=>[r.id,r]));
 const group=(table:string,key:string)=>{const map=new Map<string,Row[]>();for(const r of tables[table]??[]){const id=String(r[key]);const list=map.get(id)??[];list.push(r);map.set(id,list);}return map;};
 const blocks=group('page_blocks','page_id'),contributors=group('page_contributors','page_id'),comments=group('comments','thread_id');
 const entries:Record<string,unknown>[]=[];
 const add=(row:SearchDocument,workspace:string)=>{
  const page=row.pageId?pages.get(row.pageId):undefined,revision=page&&page.published_revision_id!==page.working_revision_id?revisions.get(page.published_revision_id):undefined;
  entries.push(...searchTextRows(row,workspace,revision?{id:String(revision.id),body_json:String(revision.body_json),properties_json:String(revision.properties_json)}:undefined));
 };
 const pageDocument=(p:Row):SearchDocument=>({kind:p.page_kind==='record'?'record':'page',id:String(p.id),pageId:String(p.id),containerId:String(p.container_id),title:String(p.title),text:retainedText(JSON.stringify({blocks:(blocks.get(String(p.id))??[]).map(b=>JSON.parse(String(b.content_json))),fields:{}})),status:p.status_key as string|null,lifecycle:p.lifecycle as string,archivedAt:p.archived_at as string|null,trashedAt:p.trashed_at as string|null,authorId:String(p.author_member_id),updatedAt:String(p.updated_at),revisionId:String(p.revision_id),contributors:(contributors.get(String(p.id))??[]).map(c=>String(c.member_id))});
 for(const p of pages.values())if(!p.deleted_at)add(pageDocument(p),String(p.workspace_id));
 for(const c of tables.containers??[])add({kind:'container',id:String(c.id),pageId:null,containerId:String(c.id),title:String(c.name),text:retainedText(String(c.description??'')),status:null,lifecycle:null,archivedAt:c.archived_at as string|null,trashedAt:c.trashed_at as string|null,authorId:null,updatedAt:String(c.updated_at),revisionId:String(c.revision_id),contributors:[]},String(c.workspace_id));
 for(const t of tables.knowledge_templates??[])if(!t.deleted_at)add({kind:'template',id:String(t.id),pageId:null,containerId:t.container_id as string|null,title:String(t.title),text:retainedText(JSON.stringify({description:t.description,snapshot:JSON.parse(String(t.snapshot_json))})),status:null,lifecycle:null,archivedAt:t.archived_at as string|null,trashedAt:null,authorId:null,updatedAt:String(t.updated_at),revisionId:String(t.revision_id),contributors:[]},String(t.workspace_id));
 for(const t of tables.comment_threads??[]){const p=pages.get(t.page_id);if(!p||p.deleted_at)continue;const bodies=(comments.get(String(t.id))??[]).filter(c=>!c.deleted_at);add({...pageDocument(p),kind:'comment-thread',id:String(t.id),text:retainedText(JSON.stringify(bodies.map(c=>JSON.parse(String(c.body_json))))),updatedAt:String(t.updated_at),revisionId:String(t.revision_id),contributors:bodies.map(c=>String(c.author_member_id))},String(t.workspace_id));}
 for(let i=0;i<entries.length;i+=250){
  let end=Math.min(i+250,entries.length);
  if(end<entries.length&&entries[end-1]!.key===entries[end]!.key)end++;
  const batch=entries.slice(i,end),columns=Object.keys(batch[0]!);
  i=end-250;
  const keys=JSON.stringify([...new Set(batch.map(row=>row.key))]);
  result.push(db.prepare('DELETE FROM search_text WHERE key IN (SELECT value FROM json_each(?))').bind(keys));
  result.push(db.prepare(`INSERT INTO search_text (${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(j.value,'$.${c}')`).join(',')} FROM json_each(?) j JOIN search_dirty d ON d.key=json_extract(j.value,'$.key') AND d.workspace_id=json_extract(j.value,'$.workspace_id')`).bind(JSON.stringify(batch)));
  // The publication batch is atomic: no writer can change these trigger generations
  // between canonical insertion, index publication, and acknowledgment.
  result.push(db.prepare('DELETE FROM search_dirty WHERE key IN (SELECT value FROM json_each(?))').bind(keys));
 }

 return result;
}
