import {prepareEraseImportCustody} from '../imports/erase-custody';
import type {FeatureContext} from '../../app/feature-context';

/** Import originals also have durable revision, receipt and activity metadata.
 * Resolve their custody inside the erasure batch, before page mappings disappear.
 * Append imports use destination custody even when they have no mapping rows. */
export function prepareEraseImportMetadata(ctx: FeatureContext, pageIds: string[], memberId?: string): D1PreparedStatement[] {
  const imports = `SELECT id FROM federation_imports WHERE workspace_id=? AND (
    actor_id=? OR destination_page_id IN (SELECT value FROM json_each(?)) OR
    id IN (SELECT import_job_id FROM federation_import_mappings WHERE target_id IN (SELECT value FROM json_each(?)))
  )`;
  const ids = JSON.stringify(pageIds);
  const values = [ctx.actor.workspaceId, ctx.actor.workspaceId, memberId ?? null, ids, ids];
  return [
    ...prepareEraseImportCustody(ctx,imports,values.slice(1)),
    ctx.db.prepare(`UPDATE core_entity_revisions SET content_json='{}',content_hash='',author_member_id=NULL
      WHERE workspace_id=? AND entity_kind='import' AND entity_id IN (${imports})`).bind(...values),
    ctx.db.prepare(`UPDATE operation_receipts SET response_json='{"value":{"deleted":true}}'
      WHERE workspace_id=? AND target_kind='import' AND target_id IN (${imports})`).bind(...values),
    ctx.db.prepare(`UPDATE activity_entries SET detail_json='{}',actor_member_id=NULL
      WHERE workspace_id=? AND target_kind='import' AND target_id IN (${imports})`).bind(...values),
    ctx.db.prepare(`UPDATE federation_import_mappings SET source_id='erased:'||id
      WHERE import_job_id IN (${imports})`).bind(...values.slice(1)),
  ];
}
