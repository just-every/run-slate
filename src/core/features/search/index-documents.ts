import type { FeatureContext } from '../../app/feature-context';
import { prepareDocuments,readDocuments,type RawSearchDocument,type SearchDocumentSelection } from './documents';
import type { PublishedText } from './text-rows';
import type { RecordFields } from './shared-records';
interface PublishedRow extends PublishedText { pageId:string }
interface RecordRow { page_id:string; field_values_json:string; fields:string }
interface DirtyRow { key:string; generation:string }
export function indexDocuments(ctx:FeatureContext,keys:string[]) {
 return readIndexDocuments(ctx,{sql:'SELECT value AS key FROM json_each(?)',bindings:[JSON.stringify(keys)]});
}
/** The bounded selection is identical in every statement of one read transaction,
 * so markers and all canonical projections need only one database bridge call.
 * Rowid preserves the workspace index's insertion order across all projections. */
export function dirtyIndexDocuments(ctx:FeatureContext,limit:number) {
 return readIndexDocuments(ctx,{sql:'SELECT key,generation FROM search_dirty WHERE workspace_id=? ORDER BY rowid LIMIT ?',bindings:[ctx.actor.workspaceId,limit]},true);
}
async function readIndexDocuments(ctx:FeatureContext,selection:SearchDocumentSelection,includeDirty=false) {
 const requested=`WITH requested AS MATERIALIZED (${selection.sql})`;
 // Resolve thread parents from the same selection, without duplicating published
 // revision bodies when multiple selected threads belong to a page.
 const revisions=ctx.db.prepare(`${requested}, requested_pages AS (
   SELECT substr(key,instr(key,':')+1) AS id FROM requested WHERE key LIKE 'page:%' OR key LIKE 'record:%'
   UNION SELECT t.page_id FROM requested j CROSS JOIN comment_threads t ON t.id=substr(j.key,instr(j.key,':')+1) WHERE j.key LIKE 'comment-thread:%' AND t.workspace_id=?
  ) SELECT p.id AS pageId,r.id,r.body_json,r.properties_json
  FROM requested_pages k CROSS JOIN pages p ON p.id=k.id
  JOIN page_revisions r ON r.id=p.published_revision_id AND r.deleted_at IS NULL
  WHERE p.workspace_id=? AND p.deleted_at IS NULL AND p.published_revision_id<>p.working_revision_id`)
  .bind(...selection.bindings,ctx.actor.workspaceId,ctx.actor.workspaceId);
 const records=ctx.db.prepare(`${requested} SELECT d.page_id,d.field_values_json,
  (SELECT json_group_array(json_object('id',id,'type',field_type,'position',position)) FROM
   (SELECT id,field_type,position FROM database_fields WHERE database_id=d.database_id ORDER BY position)) AS fields
  FROM requested j CROSS JOIN database_records d ON d.page_id=substr(j.key,instr(j.key,':')+1)
  JOIN pages p ON p.id=d.page_id WHERE j.key LIKE 'record:%' AND p.workspace_id=?`).bind(...selection.bindings,ctx.actor.workspaceId);
 const statements=[prepareDocuments(ctx,selection),revisions,records];
 if(includeDirty)statements.unshift(ctx.db.prepare(`${requested} SELECT key,generation FROM requested`).bind(...selection.bindings));
 const results=await ctx.db.batch<RawSearchDocument|PublishedRow|RecordRow|DirtyRow>(statements);
 const dirty=includeDirty?results.shift()!.results as DirtyRow[]:[];
 const [canonical,published,recordRows]=results;
 return {dirty,rows:readDocuments(canonical!.results as RawSearchDocument[]),published:new Map((published!.results as PublishedRow[]).map(r=>[r.pageId,r])),records:new Map((recordRows!.results as RecordRow[]).map(r=>[r.page_id,{values:r.field_values_json,fields:JSON.parse(r.fields)} as RecordFields]))};
}
