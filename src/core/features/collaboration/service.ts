import type { FeatureContext } from '../../app/feature-context';
import { requirePageLevel, resolveCurrentAccess } from '../sharing/current-access';
import { ApiProblem } from '../../app/problems';
import { readPage } from '../pages/service';
export async function collaborationSnapshot(ctx: FeatureContext, pageId: string, after = 0) {
    await requirePageLevel(ctx, pageId, 'view');
    const document = await readPage(ctx, pageId);
    const events = (await ctx.db.prepare('SELECT sequence,revision_id AS revisionId,kind FROM content_events WHERE page_id=? AND sequence>? ORDER BY sequence LIMIT 1000').bind(pageId, after).all()).results;
    const presence = (await ctx.db.prepare('SELECT m.id,m.display_name AS displayName,m.initials,p.session_id AS sessionId,p.cursor_json AS cursorJson FROM content_presence p JOIN members m ON m.id=p.member_id WHERE p.page_id=? AND p.expires_at>? AND m.status=\'active\'').bind(pageId, ctx.now).all<{
        id: string;
        displayName: string;
        initials: string;
        sessionId: string;
        cursorJson: string;
    }>()).results;
    return { document, events, presence: presence.map(({cursorJson,...person}) => ({...person,cursor: JSON.parse(cursorJson ?? 'null')})) };
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
