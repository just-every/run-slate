import type { BlockView } from '../../shared/api/content';
export async function publicQueries(db: D1Database, exposure: Record<string, any>) { const blocks: BlockView[] = JSON.parse(exposure.body_json); for (const block of blocks) {
    if (block.blockType !== 'content-query')
        continue;
    const definition = (block.content as any).definition ?? {};
    const rows = (await db.prepare("SELECT p.id,p.parent_page_id,p.updated_at,r.properties_json,e.host,e.slug FROM pages p JOIN public_exposures e ON e.page_id=p.id JOIN page_revisions r ON r.id=p.published_revision_id JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id WHERE p.workspace_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes') AND e.revoked_at IS NULL AND c.public_link_access='allowed' AND c.anonymous_access='allowed' AND w.public_link_access='allowed' AND w.anonymous_access='allowed' AND (? IS NULL OR p.container_id=?) AND (? IS NULL OR p.page_kind=?) AND (? IS NULL OR r.status_key=?) ORDER BY p.updated_at DESC LIMIT 100").bind(exposure.workspace_id, definition.container ?? null, definition.container ?? null, definition.pageType ?? null, definition.pageType ?? null, definition.status ?? null, definition.status ?? null).all<{
        id: string;
        parent_page_id: string | null;
        updated_at: string;
        properties_json: string;
        host: string;
        slug: string;
    }>()).results;
    const visible = [];
    for (const row of rows) {
        if (definition.contributor && !await db.prepare('SELECT 1 FROM page_contributors WHERE page_id=? AND member_id=?').bind(row.id, definition.contributor).first())
            continue;
        if (definition.dateRange) {
            const [start, end] = String(definition.dateRange).split('/');
            if (!start || !end || row.updated_at.slice(0, 10) < start || row.updated_at.slice(0, 10) > end)
                continue;
        }
        if (definition.ancestor) {
            let parent = row.parent_page_id, found = false;
            const seen = new Set<string>();
            while (parent && !seen.has(parent)) {
                seen.add(parent);
                if (parent === definition.ancestor) {
                    found = true;
                    break;
                }
                parent = (await db.prepare('SELECT parent_page_id FROM pages WHERE id=?').bind(parent).first<{
                    parent_page_id: string | null;
                }>())?.parent_page_id ?? null;
            }
            if (!found)
                continue;
        }
        visible.push(row);
    }
    if (definition.orderBy === 'title')
        visible.sort((a, b) => String(JSON.parse(a.properties_json).title).localeCompare(String(JSON.parse(b.properties_json).title)));
    block.content = { definition, results: visible.slice(0, Math.min(100, definition.limit ?? 20)).map(row => ({ id: row.id, title: JSON.parse(row.properties_json).title, url: row.host === exposure.host ? `/p/${row.slug}` : `https://${row.host}/p/${row.slug}` })) };
} return { ...exposure, body_json: JSON.stringify(blocks) }; }
