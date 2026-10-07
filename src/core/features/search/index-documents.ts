import type { FeatureContext } from '../../app/feature-context';
import { prepareDocuments,readDocuments,type RawSearchDocument } from './documents';
import type { PublishedText } from './text-rows';
interface PublishedRow extends PublishedText { pageId:string }
/** Independent canonical projections share one bridge call and one read transaction. */
export async function indexDocuments(ctx:FeatureContext,keys:string[]) {
 const selection=JSON.stringify(keys);
 // Resolve thread parents from the same key set, so published reads need not wait
 // for the canonical document response. No authority or record values are cached.
 const revisions=ctx.db.prepare(`WITH requested_pages AS (
   SELECT substr(value,instr(value,':')+1) AS id FROM json_each(?) WHERE value LIKE 'page:%' OR value LIKE 'record:%'
   UNION SELECT t.page_id FROM json_each(?) j CROSS JOIN comment_threads t ON t.id=substr(j.value,instr(j.value,':')+1) WHERE j.value LIKE 'comment-thread:%' AND t.workspace_id=?
  ) SELECT p.id AS pageId,r.id,r.body_json,r.properties_json
  FROM requested_pages k CROSS JOIN pages p ON p.id=k.id
  JOIN page_revisions r ON r.id=p.published_revision_id AND r.deleted_at IS NULL
  WHERE p.workspace_id=? AND p.deleted_at IS NULL AND p.published_revision_id<>p.working_revision_id`)
  .bind(selection,selection,ctx.actor.workspaceId,ctx.actor.workspaceId);
 const [canonical,published]=await ctx.db.batch<RawSearchDocument|PublishedRow>([prepareDocuments(ctx,keys),revisions]);
 return {rows:readDocuments(canonical!.results as RawSearchDocument[]),published:new Map((published!.results as PublishedRow[]).map(r=>[r.pageId,r]))};
}
