import {collaborationReads,collaborationResult} from './reads';
import type { FeatureContext } from '../../app/feature-context';
import { requirePageLevel } from '../sharing/current-access';
import { ApiProblem } from '../../app/problems';
import { readPage } from '../pages/service';
export async function collaborationSnapshot(ctx: FeatureContext, pageId: string, after = 0) {
    const document = await readPage(ctx, pageId);
    return collaborationForDocument(ctx, document, after);
}
/** The document has already crossed readPage's current access boundary. */
export async function collaborationForDocument(ctx:FeatureContext, document:Awaited<ReturnType<typeof readPage>>, after=0) {
    const rows=await Promise.all(collaborationReads(ctx,document.page.id,after).map(query=>query.all()));
    return collaborationResult(document,rows);
}
export async function updatePresence(ctx: FeatureContext, pageId: string, sessionId: string, cursor: unknown) {
    await requirePageLevel(ctx, pageId, 'view');
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId))
        throw new ApiProblem(400, 'INVALID_SESSION', 'Invalid collaboration session.');
    await ctx.db.prepare('INSERT INTO content_presence (page_id,member_id,session_id,cursor_json,expires_at) VALUES (?,?,?,?,?) ON CONFLICT(page_id,member_id,session_id) DO UPDATE SET cursor_json=excluded.cursor_json,expires_at=excluded.expires_at').bind(pageId, ctx.actor.id, sessionId, JSON.stringify(cursor ?? null), new Date(Date.parse(ctx.now) + 30000).toISOString()).run();
    return { present: true };
}

export async function refreshPresence(ctx: FeatureContext, pageId: string, sessionId: string) {
    await ctx.db.prepare('UPDATE content_presence SET expires_at=? WHERE page_id=? AND member_id=? AND session_id=?').bind(new Date(Date.parse(ctx.now)+30000).toISOString(),pageId,ctx.actor.id,sessionId).run();
}
