import type {D1Database,D1Sql,D1UndoSnapshot} from '../../../../modules/import-kit/src/d1/index.ts';
import type {NativeUnit} from './native-plan';
const identifier=(name:string)=>{if(!/^[a-z][a-z0-9_]*$/.test(name))throw new Error('Invalid native dependency identifier.');return `"${name}"`;};
/** Visit/presence/access projections have no independent authored content. They
 * must not turn opening an unchanged imported page into a destructive conflict. */
export const derivedPageReferences=['page_access_index','content_page_opens','content_tree_expansion','content_presence','recent_pages','page_views','search_documents'] as const;
export const derivedContainerReferences=['page_views','search_documents'] as const;
/** A share's own notice goes with the page it shared, like the share's grant:
 * it is access, not an authored dependency (see the page remove in native-targets). */
export const shareNotice={table:'notifications',column:'source_page_id',event:'access-granted'} as const;
const referenceFilter=(ref:Reference)=>ref.table_name===shareNotice.table&&ref.column_name===shareNotice.column?` AND event<>'${shareNotice.event}'`:'';
interface Reference {table_name:string;column_name:string;parent_table:string}
/** One statement: every foreign key that points at an importable native table. */
export async function nativeReferenceCatalog(db:D1Database):Promise<Reference[]> {
 const rows=(await db.prepare(`SELECT m.name AS table_name,f."from" AS column_name,f."table" AS parent_table FROM sqlite_master m,pragma_foreign_key_list(m.name) f WHERE m.type='table' AND m.sql LIKE '%REFERENCES%' ORDER BY m.name,f.id,f.seq`).all<Reference>()).results;
 return rows.filter(row=>['pages','containers','files','members','groups','databases'].includes(row.parent_table));
}
export interface IncomingCheck {id:string;references:Reference[];query:string}
/** Every remaining incoming FK is a native dependency, including future feature
 * tables. Each check is a scalar subquery the caller reads in its own snapshot
 * statement, then fences as a guard against concurrent additions. Exact owned
 * scopes and explicit cross-effect relationships are checked elsewhere. */
export function nativeIncomingChecks(catalog:Reference[],unit:NativeUnit,handled:{table:string;column:string;target:string}[]):IncomingCheck[] {
 const checks:IncomingCheck[]=[];
 for(const root of unit.rows.filter(row=>['pages','containers','files','members','groups','databases'].includes(row.table))){
  const id=String(root.values.id),references=catalog.filter(ref=>ref.parent_table===root.table
   &&!(root.table==='pages'&&derivedPageReferences.includes(ref.table_name as typeof derivedPageReferences[number]))
   &&!(root.table==='containers'&&derivedContainerReferences.includes(ref.table_name as typeof derivedContainerReferences[number]))
   &&!handled.some(item=>item.table===ref.table_name&&item.column===ref.column_name&&item.target===id)
   &&!unit.scopes.some(scope=>scope.table===ref.table_name&&scope.column===ref.column_name&&scope.id===id));
  if(!references.length)continue;
  const exists=references.map(ref=>`EXISTS(SELECT 1 FROM ${identifier(ref.table_name)} WHERE ${identifier(ref.column_name)}=target.id${referenceFilter(ref)})`);
  checks.push({id,references,query:`SELECT json_array(${exists.join(',')}) AS snapshot FROM (SELECT ? AS id) target`});
 }
 return checks;
}
export function incomingDependencies(checks:IncomingCheck[],snapshots:string[],effectId:string) {
 const guards:D1Sql[]=[],dependencies:D1UndoSnapshot['dependencies']=[];
 checks.forEach((check,index)=>{
  const snapshot=snapshots[index]!,flags=JSON.parse(snapshot) as number[];
  guards.push({sql:`(${check.query})=?`,params:[check.id,snapshot]});
  check.references.forEach((ref,position)=>{if(flags[position])dependencies.push({requiredEffectId:effectId,cause:{table:ref.table_name,recordId:check.id,field:ref.column_name},evidence:{reason:'Required native reference'}});});
 });
 return {guards,dependencies};
}
