import type { FeatureContext } from '../../app/feature-context';
import { resolveCurrentAccessMany,type CurrentAccess } from '../sharing/current-access';
import type { Field,Values } from '../databases/values';

export interface RecordNode { id:string; database_id:string|null; field_values_json:string|null; created_at:string|null; updated_at:string|null; published_revision_id:string|null; working_revision_id:string; body_json:string|null; properties_json:string|null }
export interface RecordGraph { nodes:Map<string,RecordNode>; definitions:Map<string,Field[]>; access:Map<string,CurrentAccess>; files:Map<string,string>; values:Map<string,Values>; readable:Set<string> }
/** Fetch the requested records and their transitive readable dependencies in batches.
 * No per-field network calls and no workspace-wide relation enumeration on queries.
 */
export async function recordGraph(ctx:FeatureContext,ids:string[],includeTrashed:boolean):Promise<RecordGraph> {
 const graph:RecordGraph={nodes:new Map(),definitions:new Map(),access:new Map(),files:new Map(),values:new Map(),readable:new Set()};
 let frontier=[...new Set(ids)];const seen=new Set<string>();
 for(;frontier.length;){
  const requested=frontier.filter(id=>!seen.has(id));if(!requested.length)break;
  for(const id of requested)seen.add(id);
  const key=JSON.stringify(requested);
  // Related targets always use ordinary view access, even in a trash search.
  const [rows,permissions]=await Promise.all([
   ctx.db.prepare(`SELECT p.id,d.database_id,d.field_values_json,d.created_at,d.updated_at,p.published_revision_id,p.working_revision_id,r.body_json,r.properties_json
    FROM json_each(?) j CROSS JOIN pages p ON p.id=j.value LEFT JOIN database_records d ON d.page_id=p.id LEFT JOIN page_revisions r ON r.id=p.published_revision_id AND r.deleted_at IS NULL WHERE p.workspace_id=? AND p.deleted_at IS NULL`).bind(key,ctx.actor.workspaceId).all<RecordNode>(),
   resolveCurrentAccessMany(ctx,requested,{includeTrashed}),
  ]);
  for(const [id,permission]of permissions)graph.access.set(id,permission);
  const missing=[...new Set(rows.results.flatMap(r=>r.database_id&&!graph.definitions.has(r.database_id)?[r.database_id]:[]))];
  if(missing.length){
   const fs=(await ctx.db.prepare('SELECT id,database_id,name,field_type,config_json,position FROM database_fields WHERE database_id IN (SELECT value FROM json_each(?)) ORDER BY position').bind(JSON.stringify(missing)).all<{id:string;database_id:string;name:string;field_type:Field['type'];config_json:string;position:number}>()).results;
   for(const id of missing)graph.definitions.set(id,[]);
   for(const f of fs)graph.definitions.get(f.database_id)!.push({id:f.id,name:f.name,type:f.field_type,config:JSON.parse(f.config_json),position:f.position});
  }
  const related=new Set<string>(),fileIds=new Set<string>();
  for(const row of rows.results){
   graph.nodes.set(row.id,row);const permission=permissions.get(row.id);if(!permission?.decision.allowed)continue;
   const published=!['edit','full'].includes(permission.decision.level!)&&row.published_revision_id&&row.published_revision_id!==row.working_revision_id;
   const values=published?JSON.parse(row.properties_json??'{}').databaseFields??{}:JSON.parse(row.field_values_json??'{}');graph.values.set(row.id,values);
   for(const field of graph.definitions.get(row.database_id??'')??[]){
    if(field.type!=='relation'&&field.type!=='file')continue;
    for(const id of Array.isArray(values[field.id])?values[field.id]:[])if(typeof id==='string')(field.type==='relation'?related:fileIds).add(id);
   }
  }
  if(fileIds.size){const files=(await ctx.db.prepare('SELECT id,page_id FROM files WHERE id IN (SELECT value FROM json_each(?)) AND workspace_id=? AND deleted_at IS NULL AND page_id IS NOT NULL').bind(JSON.stringify([...fileIds]),ctx.actor.workspaceId).all<{id:string;page_id:string}>()).results;for(const f of files){graph.files.set(f.id,f.page_id);related.add(f.page_id);}}
  frontier=[...related].filter(id=>!seen.has(id));
 }
 if(includeTrashed){
  // Root visibility may include trash; relation values never gain that authority.
  const ordinary=await resolveCurrentAccessMany(ctx,[...graph.nodes.keys()]);
  for(const [id,a]of ordinary)if(a.decision.allowed)graph.readable.add(id);
 }else for(const [id,a]of graph.access)if(a.decision.allowed)graph.readable.add(id);
 return graph;
}
