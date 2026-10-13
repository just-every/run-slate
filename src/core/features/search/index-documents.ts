import type { FeatureContext } from '../../app/feature-context';
import { prepareDocuments,readDocuments,type RawSearchDocument } from './documents';
import type { PublishedText } from './text-rows';
import type { RecordFields } from './shared-records';
interface PublishedRow extends PublishedText { pageId:string }
interface RecordRow { page_id:string; field_values_json:string; fields:string }
/** Independent canonical projections share one bridge call and one read transaction. */
export async function indexDocuments(ctx:FeatureContext,keys:string[]) {
 const selection=JSON.stringify(keys);
 // Resolve thread parents from the same key set, so published reads need not wait
 // for the canonical document response. No authority is cached.
 const revisions=ctx.db.prepare(`WITH requested_pages AS (
   SELECT substr(value,instr(value,':')+1) AS id FROM json_each(?) WHERE value LIKE 'page:%' OR value LIKE 'record:%'
   UNION SELECT t.page_id FROM json_each(?) j CROSS JOIN comment_threads t ON t.id=substr(j.value,instr(j.value,':')+1) WHERE j.value LIKE 'comment-thread:%' AND t.workspace_id=?
  ) SELECT p.id AS pageId,r.id,r.body_json,r.properties_json
  FROM requested_pages k CROSS JOIN pages p ON p.id=k.id
  JOIN page_revisions r ON r.id=p.published_revision_id AND r.deleted_at IS NULL
  WHERE p.workspace_id=? AND p.deleted_at IS NULL AND p.published_revision_id<>p.working_revision_id`)
  .bind(selection,selection,ctx.actor.workspaceId,ctx.actor.workspaceId);
 const records=ctx.db.prepare(`SELECT d.page_id,d.field_values_json,
  (SELECT json_group_array(json_object('id',id,'type',field_type,'position',position)) FROM
   (SELECT id,field_type,position FROM database_fields WHERE database_id=d.database_id ORDER BY position)) AS fields
  FROM json_each(?) j CROSS JOIN database_records d ON d.page_id=substr(j.value,instr(j.value,':')+1)
  JOIN pages p ON p.id=d.page_id WHERE j.value LIKE 'record:%' AND p.workspace_id=?`).bind(selection,ctx.actor.workspaceId);
 const [canonical,published,recordRows]=await ctx.db.batch<RawSearchDocument|PublishedRow|RecordRow>([prepareDocuments(ctx,keys),revisions,records]);
 return {rows:readDocuments(canonical!.results as RawSearchDocument[]),published:new Map((published!.results as PublishedRow[]).map(r=>[r.pageId,r])),records:new Map((recordRows!.results as RecordRow[]).map(r=>[r.page_id,{values:r.field_values_json,fields:JSON.parse(r.fields)} as RecordFields]))};
}
