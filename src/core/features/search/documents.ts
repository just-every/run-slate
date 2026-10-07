import type { FeatureContext } from '../../app/feature-context';
import { resolveCurrentAccessMany } from '../sharing/current-access';
import { recordValues } from '../databases/evaluation';
import { fields } from '../databases/repository';
import type { Field,Values } from '../databases/values';
import { readableTarget } from './visibility';
export interface SearchDocument { kind:string; id:string; pageId:string|null; containerId:string|null; title:string; text:string; status:string|null; lifecycle:string|null; archivedAt:string|null; trashedAt:string|null; authorId:string|null; updatedAt:string; revisionId:string; contributors:string[] }
export interface RawSearchDocument extends Omit<SearchDocument,'contributors'> { contributors:string }
/** Canonical retained content for generation-guarded refresh and reader-specific records. */
export function prepareDocuments(ctx:FeatureContext, keys?:string[]):D1PreparedStatement {
  const selection=keys?JSON.stringify(keys):null;
  // CROSS JOIN fixes the loop order: each requested key drives a primary-key
  // lookup, even when the workspace index appears cheaper to SQLite's planner.
  const source=(table:string,alias:string,kinds:string[])=>keys?`(SELECT DISTINCT substr(value,instr(value,':')+1) AS id FROM json_each(?) WHERE ${kinds.map(k=>`value LIKE '${k}:%'`).join(' OR ')}) requested CROSS JOIN ${table} ${alias} ON ${alias}.id=requested.id`:`${table} ${alias}`;
  const bindings=()=>keys?[selection,ctx.actor.workspaceId]:[ctx.actor.workspaceId];
  return ctx.db.prepare(`SELECT CASE WHEN p.page_kind='record' THEN 'record' ELSE 'page' END AS kind,p.id,p.id AS pageId,p.container_id AS containerId,p.title,
    json_object('blocks',json(COALESCE((SELECT json_group_array(json(content_json)) FROM page_blocks WHERE page_id=p.id),'[]')),'fields',json('{}')) AS text,
    CASE WHEN EXISTS(SELECT 1 FROM page_verifications v WHERE v.page_id=p.id AND v.id=(SELECT v2.id FROM page_verifications v2 WHERE v2.page_id=p.id ORDER BY v2.created_at DESC,v2.id DESC LIMIT 1) AND v.status_key=p.status_key AND (v.expires_at<=? OR v.revision_id<>p.working_revision_id)) THEN 'lapsed' ELSE p.status_key END AS status,p.lifecycle,p.archived_at AS archivedAt,p.trashed_at AS trashedAt,p.author_member_id AS authorId,p.updated_at AS updatedAt,p.revision_id AS revisionId,
    COALESCE((SELECT json_group_array(member_id) FROM page_contributors WHERE page_id=p.id),'[]') AS contributors
    FROM ${source('pages','p',['page','record'])} WHERE p.workspace_id=? AND p.deleted_at IS NULL
    UNION ALL SELECT 'container',c.id,NULL,c.id,c.name,c.description,NULL,NULL,c.archived_at,c.trashed_at,NULL,c.updated_at,c.revision_id,'[]' FROM ${source('containers','c',['container'])} WHERE c.workspace_id=?
    UNION ALL SELECT 'template',t.id,NULL,t.container_id,t.title,json_object('description',t.description,'snapshot',json(t.snapshot_json)),NULL,NULL,t.archived_at,NULL,NULL,t.updated_at,t.revision_id,'[]' FROM ${source('knowledge_templates','t',['template'])} WHERE t.workspace_id=? AND t.deleted_at IS NULL
    UNION ALL SELECT 'comment-thread',t.id,t.page_id,p.container_id,p.title,COALESCE((SELECT json_group_array(json(body_json)) FROM comments WHERE thread_id=t.id AND deleted_at IS NULL),'[]'),p.status_key,p.lifecycle,p.archived_at,p.trashed_at,p.author_member_id,t.updated_at,t.revision_id,COALESCE((SELECT json_group_array(author_member_id) FROM comments WHERE thread_id=t.id AND deleted_at IS NULL),'[]') FROM ${source('comment_threads','t',['comment-thread'])} JOIN pages p ON p.id=t.page_id AND p.workspace_id=t.workspace_id WHERE t.workspace_id=? AND p.deleted_at IS NULL`).bind(ctx.now,...bindings(),...bindings(),...bindings(),...bindings());
}
export function readDocuments(rows:RawSearchDocument[]):SearchDocument[] {
  return rows.map(row=>({...row,text:retainedText(row.text),contributors:JSON.parse(row.contributors) as string[]}));
}
export async function documents(ctx:FeatureContext,keys?:string[]):Promise<SearchDocument[]> {
  return readDocuments((await prepareDocuments(ctx,keys).all<RawSearchDocument>()).results);
}
/** Keep prose/field values; do not search JSON property names as if they were content. */
export function retainedText(value:string):string {
 let parsed:unknown;try{parsed=JSON.parse(value);}catch{return value.normalize('NFC');}
 const fields=(v:unknown):string=>v===null?'':Array.isArray(v)?v.map(fields).join('\n'):typeof v==='object'?Object.values(v as object).map(fields).join('\n'):String(v);
 const walk=(v:unknown):string=>{
  if(v===null||v===undefined)return '';if(typeof v==='string')return v.normalize('NFC');if(typeof v==='number'||typeof v==='boolean')return String(v);
  if(Array.isArray(v)){const spans=v.every(item=>item&&typeof item==='object'&&typeof item.text==='string');return v.map(walk).join(spans?'':'\n');}
  return Object.entries(v as Record<string,unknown>).filter(([key])=>['text','code','summary','content','cells','rows','columns','caption','alt','items','detail','attribution','blocks','body','description','snapshot','title','fields','properties'].includes(key)).map(([key,item])=>key==='fields'?fields(item):walk(item)).join('\n');
 };return walk(parsed);
}
export async function readableDocument(ctx:FeatureContext,row:SearchDocument):Promise<boolean> {return readableTarget(ctx,row.pageId?'page':row.kind,row.pageId??row.id);}

/** Replace unpublished metadata/content before matching, never after a hit/count is calculated. */
export async function visibleDocuments(ctx:FeatureContext,rows:SearchDocument[],includeTrashed=false):Promise<SearchDocument[]> {
 const result:SearchDocument[]=[];const ids=[...new Set(rows.flatMap(r=>r.pageId?[r.pageId]:[]))];
 const [access,revisionRows,recordRows]=await Promise.all([resolveCurrentAccessMany(ctx,ids,{includeTrashed}),ctx.db.prepare('SELECT p.id,p.published_revision_id AS published,p.working_revision_id AS working,r.body_json,r.properties_json FROM pages p LEFT JOIN page_revisions r ON r.id=p.published_revision_id AND r.deleted_at IS NULL WHERE p.workspace_id=? AND p.id IN (SELECT value FROM json_each(?))').bind(ctx.actor.workspaceId,JSON.stringify(ids)).all<{id:string;published:string|null;working:string;body_json:string|null;properties_json:string|null}>(),ctx.db.prepare('SELECT page_id,database_id,field_values_json FROM database_records WHERE page_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{page_id:string;database_id:string;field_values_json:string}>()]);
 const revisions=new Map(revisionRows.results.map(r=>[r.id,r]));const records=new Map(recordRows.results.map(r=>[r.page_id,r]));const definitions=new Map<string,Field[]>();
 for(const row of rows){
  if(!row.pageId){if(await readableDocument(ctx,row))result.push(row);continue;}
  const permission=access.get(row.pageId);if(!permission?.decision.allowed)continue;const revision=revisions.get(row.pageId);if(!revision)continue;
  if(!['edit','full'].includes(permission.decision.level!)&&revision.published&&revision.published!==revision.working){
   if(!revision.body_json||!revision.properties_json)continue;const properties=JSON.parse(revision.properties_json) as {title?:string;statusKey?:string|null;databaseFields?:Values};const record=records.get(row.id);let recordText='';if(record&&properties.databaseFields){if(!definitions.has(record.database_id))definitions.set(record.database_id,await fields(ctx,record.database_id));recordText=retainedText(JSON.stringify({fields:await recordValues(ctx,record.database_id,properties.databaseFields,definitions.get(record.database_id))}));}
   result.push({...row,title:properties.title??row.title,text:row.kind==='comment-thread'?row.text:retainedText(revision.body_json)+'\n'+recordText,status:row.status==='lapsed'?'lapsed':Object.prototype.hasOwnProperty.call(properties,'statusKey')?properties.statusKey??null:row.status,revisionId:revision.published});
  }else{const record=records.get(row.id);if(record){if(!definitions.has(record.database_id))definitions.set(record.database_id,await fields(ctx,record.database_id));const values=await recordValues(ctx,record.database_id,JSON.parse(record.field_values_json) as Values,definitions.get(record.database_id));result.push({...row,text:row.text+'\n'+retainedText(JSON.stringify({fields:values}))});}else result.push(row);}
 }
 return result;
}
