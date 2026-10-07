import type { AppBindings } from '../../app/types';
/** Called after committed ACL changes; only live rooms are contacted and every socket reauthenticates. */
export async function invalidateContentRooms(env: AppBindings, pageIds?: string[]) { if (!env.CONTENT_COLLABORATION)
    return; const ids = pageIds ?? (await env.DB.prepare('SELECT DISTINCT page_id FROM content_presence WHERE expires_at>?').bind(new Date().toISOString()).all<{
    page_id: string;
}>()).results.map(r => r.page_id); await Promise.all([...new Set(ids)].map(async (id) => { const response = await env.CONTENT_COLLABORATION!.get(env.CONTENT_COLLABORATION!.idFromName(id)).fetch('https://internal/invalidate', { method: 'POST' }); if (!response.ok)
    throw new Error('Collaboration access invalidation failed.'); })); }
