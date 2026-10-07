import type {FeatureContext} from '../../app/feature-context';
/** Archives are indivisible: erasure revokes retained exports and affected import originals. */
export function prepareInvalidateExports(ctx:FeatureContext,pageIds:string[]=[]):D1PreparedStatement[]{const statements=[
 ctx.db.prepare("INSERT INTO content_media_cleanup SELECT source_archive_key,? FROM portability_jobs WHERE status_workspace_id=? AND source_archive_key IS NOT NULL ON CONFLICT DO NOTHING").bind(ctx.now,ctx.actor.workspaceId),
 ctx.db.prepare("INSERT INTO content_media_cleanup SELECT value,? FROM portability_jobs,json_each(cleanup_json) WHERE status_workspace_id=? AND NOT(kind='restore' AND state='completed') ON CONFLICT DO NOTHING").bind(ctx.now,ctx.actor.workspaceId),
 ctx.db.prepare("UPDATE portability_jobs SET state='failed',counts_json='{}',report_json=?,lease_id=NULL,lease_until=NULL,updated_at=?,completed_at=? WHERE status_workspace_id=?").bind(JSON.stringify({code:'INVALIDATED',message:'Retained source was erased. Create a fresh operation.'}),ctx.now,ctx.now,ctx.actor.workspaceId),
 ctx.db.prepare('INSERT INTO content_media_cleanup(storage_key,created_at) SELECT archive_key,? FROM federation_exports WHERE workspace_id=? AND archive_key IS NOT NULL ON CONFLICT DO NOTHING').bind(ctx.now,ctx.actor.workspaceId),
 ctx.db.prepare("UPDATE federation_exports SET state='invalidated',archive_key=NULL,revision_id=?,report_json=?,updated_at=? WHERE workspace_id=? AND state IN ('queued','running','completed')").bind(crypto.randomUUID(),JSON.stringify({reason:'Retained source was erased. Create a fresh export.'}),ctx.now,ctx.actor.workspaceId)
 ];
 // Append imports predate per-page mappings; their retained destination is the
 // original's custody record. Use it as well as mappings for existing archives.
 for(const pageId of pageIds){const affected="(destination_page_id=? OR id IN (SELECT import_job_id FROM federation_import_mappings WHERE target_id=?))";statements.push(
 ctx.db.prepare(`INSERT INTO content_media_cleanup(storage_key,created_at) SELECT archive_key,? FROM federation_imports WHERE workspace_id=? AND ${affected} AND state!='deleted' ON CONFLICT DO NOTHING`).bind(ctx.now,ctx.actor.workspaceId,pageId,pageId),
 ctx.db.prepare(`UPDATE federation_imports SET state='deleted',report_json='{}',counts_json='{}',filename='Erased original archive',revision_id=?,updated_at=? WHERE workspace_id=? AND ${affected}`).bind(crypto.randomUUID(),ctx.now,ctx.actor.workspaceId,pageId,pageId));}
 return statements;
}
