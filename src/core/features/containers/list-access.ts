import type { FeatureContext } from '../../app/feature-context';
import type { AccessLevel, KnowledgeGrant, MemberSubject } from '../../shared/knowledge/model';
import { publishedImportContainerSql } from '../imports/publication';
import { currentSubject } from '../sharing/current-access';

/** The same current grants as requireContainerLevel, resolved once for a listing. */
export async function containerListAccess(ctx: FeatureContext, ids: string[], subject?: MemberSubject): Promise<Map<string, AccessLevel>> {
    const reader = subject ?? await currentSubject(ctx);
    const result = new Map<string, AccessLevel>();
    if (!ids.length) return result;
    const targets = JSON.stringify([...new Set(ids)]);
    const [containers, grants] = await Promise.all([
        ctx.db.prepare(`SELECT c.id,c.visibility,c.guest_access,w.guest_access AS workspace_guests,
            EXISTS(SELECT 1 FROM container_owners o WHERE o.container_id=c.id AND o.member_id=?) AS owned
            FROM containers c JOIN workspaces w ON w.id=c.workspace_id
            WHERE c.workspace_id=? AND c.id IN (SELECT value FROM json_each(?)) AND ${publishedImportContainerSql('c.id')}`)
            .bind(ctx.actor.id, ctx.actor.workspaceId, targets).all<{id:string;visibility:string;guest_access:string;workspace_guests:string;owned:number}>(),
        ctx.db.prepare('SELECT container_id AS containerId,principal_kind AS principalKind,principal_id AS principalId,level,expires_at AS expiresAt,revoked_at AS revokedAt FROM container_grants WHERE container_id IN (SELECT value FROM json_each(?))')
            .bind(targets).all<KnowledgeGrant & {containerId:string}>()
    ]);
    const rank = {view:1, comment:2, edit:3, full:4};
    const available = new Map<string, Array<KnowledgeGrant>>();
    for (const grant of grants.results) {
        const grouped = available.get(grant.containerId) ?? [];
        grouped.push(grant);
        available.set(grant.containerId, grouped);
    }
    for (const row of containers.results) {
        if (reader.isGuest && (row.guest_access === 'forbidden' || row.workspace_guests === 'forbidden')) continue;
        if (row.owned) { result.set(row.id, 'full'); continue; }
        if (row.visibility === 'personal') continue;
        for (const grant of available.get(row.id) ?? []) {
            if (grant.revokedAt || (grant.expiresAt && grant.expiresAt <= ctx.now)) continue;
            const matches = grant.principalKind === 'member' ? grant.principalId === reader.memberId
                : grant.principalKind === 'group' ? reader.groupIds.includes(grant.principalId)
                : !reader.isGuest && (grant.principalKind === 'workspace' ? grant.principalId === reader.workspaceId : reader.containerIds.includes(grant.principalId));
            if (matches && rank[grant.level] > (result.has(row.id) ? rank[result.get(row.id)!] : 0)) result.set(row.id, grant.level);
        }
    }
    return result;
}
