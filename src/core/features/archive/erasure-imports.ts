import {mutationGuard} from '../../app/operations';
import {prepareEraseImportCustody} from '../imports/erase-custody';
import type {FeatureContext} from '../../app/feature-context';

/** Import originals also have durable revision, receipt and activity metadata.
 * Resolve their custody inside the erasure batch, before page mappings disappear.
 * Append imports use destination custody even when they have no mapping rows. */
export async function prepareEraseImportMetadata(ctx: FeatureContext, pageIds: string[], memberId?: string): Promise<D1PreparedStatement[]> {
  const selection = `SELECT id FROM federation_imports WHERE workspace_id=? AND (
    actor_id=? OR destination_page_id IN (SELECT value FROM json_each(?)) OR
    id IN (SELECT import_job_id FROM federation_import_mappings WHERE target_id IN (SELECT value FROM json_each(?))) OR
    id IN (SELECT import_id FROM import_native_targets WHERE target_id=? OR target_id IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_tree(value_json) j WHERE j.type='text' AND j.atom=?)) OR
    EXISTS(SELECT 1 FROM json_tree(federation_imports.mapping_json) j WHERE j.type='text' AND j.atom=?)
  )`;
  const ids = JSON.stringify(pageIds);
  const selectionValues=[ctx.actor.workspaceId,memberId??null,ids,ids,memberId??null,ids,memberId??null,memberId??null];
  const selected=(await ctx.db.prepare(selection+' ORDER BY id').bind(...selectionValues).all<{id:string}>()).results.map(row=>row.id);
  const exact=JSON.stringify(selected),imports='SELECT value FROM json_each(?)',values=[ctx.actor.workspaceId,exact];
  return [
    mutationGuard(ctx.db,`SELECT (SELECT COALESCE(json_group_array(id),'[]') FROM (${selection} ORDER BY id))=?`,[...selectionValues,exact]),
    // Older previews copied the entire live directory into unrelated reports.
    // Candidates are now response-only; remove those snapshots atomically while
    // preserving every unrelated import's report, native effects and Undo.
    ...(memberId?[ctx.db.prepare("UPDATE federation_imports SET report_json=json_remove(report_json,'$.candidates') WHERE workspace_id=? AND json_type(report_json,'$.candidates') IS NOT NULL").bind(ctx.actor.workspaceId)]:[]),
    ...prepareEraseImportCustody(ctx,imports,values.slice(1)),
    ctx.db.prepare(`UPDATE core_entity_revisions SET content_json='{}',content_hash='',author_member_id=NULL
      WHERE workspace_id=? AND entity_kind='import' AND entity_id IN (${imports})`).bind(...values),
    ctx.db.prepare(`UPDATE operation_receipts SET response_json='{"value":{"deleted":true}}'
      WHERE workspace_id=? AND target_kind='import' AND target_id IN (${imports})`).bind(...values),
    ctx.db.prepare(`UPDATE activity_entries SET detail_json='{}',actor_member_id=NULL
      WHERE workspace_id=? AND target_kind='import' AND target_id IN (${imports})`).bind(...values),
  ];
}
