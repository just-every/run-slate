import type { FeatureContext } from '../../../app/feature-context';
import { notificationStatements, registerNotificationCreationEligibility } from '../../notifications/events';
import type { RuleKind } from './definitions';
import { readablePageIds } from './readable';

export interface ChangedPage { pageId: string; title: string; change: 'unverified' | 'flagged'; rule: RuleKind }

/**
 * STAT-007: a run's one coalesced `verification-rules` notice per affected owner. The
 * owner is the page's owner while an active member, else the container's owners
 * (workspace owners when it has none). A recipient's notice names, counts and links
 * only pages that recipient can read; those pages are its `sourcePageIds`, which the
 * outbox and inbox recheck at delivery and on every read. Never page text.
 */
export async function ruleNoticeStatements(ctx: FeatureContext, containerId: string, night: string, pages: ChangedPage[]): Promise<D1PreparedStatement[]> {
  if (!pages.length) return [];
  const owners = (await ctx.db.prepare("SELECT p.id AS pageId,m.id AS ownerId FROM pages p LEFT JOIN members m ON m.id=p.owner_member_id AND m.workspace_id=p.workspace_id AND m.status='active' WHERE p.id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(pages.map(p => p.pageId))).all<{ pageId: string; ownerId: string | null }>()).results;
  let containerOwners = (await ctx.db.prepare("SELECT m.id FROM container_owners co JOIN members m ON m.id=co.member_id AND m.status='active' WHERE co.container_id=? ORDER BY m.id").bind(containerId).all<{ id: string }>()).results.map(r => r.id);
  if (!containerOwners.length) containerOwners = (await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND role='owner' AND member_kind='member' AND status='active' ORDER BY id").bind(ctx.actor.workspaceId).all<{ id: string }>()).results.map(r => r.id);
  const byRecipient = new Map<string, ChangedPage[]>();
  for (const page of pages) {
    const owner = owners.find(o => o.pageId === page.pageId)?.ownerId;
    for (const recipient of owner ? [owner] : containerOwners) byRecipient.set(recipient, [...byRecipient.get(recipient) ?? [], page]);
  }
  const statements: D1PreparedStatement[] = [];
  for (const [recipient, candidates] of [...byRecipient].sort(([a], [b]) => a.localeCompare(b))) {
    const readable = await readablePageIds(ctx.db, recipient, ctx.actor.workspaceId, [...new Set(candidates.map(p => p.pageId))], ctx.now);
    const listed = candidates.filter(p => readable.has(p.pageId));
    if (!listed.length) continue;
    statements.push(...notificationStatements(ctx, { id: `verification-rules:${containerId}:${night}:${recipient}`, event: 'verification-rules', actorId: null, recipientIds: [recipient], detail: {
      sourcePageIds: [...new Set(listed.map(p => p.pageId))],
      verificationRules: { containerId, night, unverified: listed.filter(p => p.change === 'unverified').length, flagged: listed.filter(p => p.change === 'flagged').length, pages: listed.map(p => ({ id: p.pageId, title: p.title, change: p.change, rule: p.rule })) },
    } }));
  }
  return statements;
}

// Creation eligibility: a container owner, the owner of a listed page, or (for a container without owners) a workspace owner.
registerNotificationCreationEligibility('verification-rules', (member, fact) => {
  const detail = fact.detail?.verificationRules;
  if (!detail?.containerId) return { sql: '0', values: [] };
  return {
    sql: `(EXISTS(SELECT 1 FROM container_owners co WHERE co.container_id=? AND co.member_id=${member}.id) OR EXISTS(SELECT 1 FROM pages op WHERE op.owner_member_id=${member}.id AND op.id IN (SELECT value FROM json_each(?))) OR (${member}.role='owner' AND ${member}.member_kind='member'))`,
    values: [detail.containerId, JSON.stringify(fact.detail?.sourcePageIds ?? [])],
  };
});
