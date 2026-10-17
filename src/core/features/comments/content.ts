import type {FeatureContext} from '../../app/feature-context';
import {requestHash} from '../../app/operations';

export async function commentRevision(ctx: FeatureContext, id: string, revisionId: string, value: unknown) { return ctx.db.prepare('INSERT INTO record_revisions (id,workspace_id,entity_kind,entity_id,content_hash,content_json,author_member_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(revisionId, ctx.actor.workspaceId, 'comment-thread', id, await requestHash({ value, revisionId }), JSON.stringify(value), ctx.actor.id, ctx.now); }
export function mentionIds(value: unknown): string[] {
    const ids = new Set<string>();
    function walk(v: unknown) {
        if (Array.isArray(v))
            v.forEach(walk);
        else if (v && typeof v === 'object') {
            const o = v as Record<string, any>;
            if (o.mention?.kind === 'person' && typeof o.mention.id === 'string')
                ids.add(o.mention.id);
            Object.values(o).forEach(walk);
        }
    }
    walk(value);
    return [...ids];
}
