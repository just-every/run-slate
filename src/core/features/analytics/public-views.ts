/** Public renderer calls after its current exposure check; this insert revalidates exposure vetoes. No identity tracking. */
export function publicViewStatement(db:D1Database,input:{viewId:string;pageId:string;host:string;slug:string;now:string}):D1PreparedStatement {
 return db.prepare(`INSERT OR IGNORE INTO page_views(id,workspace_id,page_id,container_id,viewer_member_id,viewer_kind,is_own_page,viewed_at)
 SELECT ?,p.workspace_id,p.id,p.container_id,NULL,'anonymous',0,? FROM pages p JOIN public_exposures e ON e.page_id=p.id JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id JOIN page_revisions r ON r.id=p.published_revision_id
 WHERE p.id=? AND e.host=? AND e.slug=? AND e.revoked_at IS NULL AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes') AND r.deleted_at IS NULL AND c.public_link_access='allowed' AND w.public_link_access='allowed' AND c.anonymous_access='allowed' AND w.anonymous_access='allowed'`).bind(input.viewId,input.now,input.pageId,input.host,input.slug);
}
