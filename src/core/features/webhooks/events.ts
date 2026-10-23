import type { FeatureContext } from '../../app/feature-context';
import { activityPageId } from '../activity/context';
import { auditRecord } from '../activity/service';
import { currentPageTitle, permitted } from '../search/visibility';
import { requireWorkspaceOwner } from '../sharing/current-access';
import type { Subscription } from './store';
export interface EventRecord { sequence: number; event_id: string; action: string; target_kind: string; target_id: string; occurred_at: string }
export async function eventRecord(ctx: FeatureContext, id: string) {
  return ctx.db.prepare('SELECT e.sequence,e.event_id,a.action,a.target_kind,a.target_id,a.occurred_at FROM webhook_events e JOIN activity_entries a ON a.id=e.event_id WHERE e.event_id=? AND e.workspace_id=?').bind(id, ctx.actor.workspaceId).first<EventRecord>();
}
async function eventContext(ctx: FeatureContext, event: EventRecord) {
  const pageId = await activityPageId(ctx, event.target_kind, event.target_id);
  const page = pageId ? await ctx.db.prepare('SELECT container_id,page_kind FROM pages WHERE id=? AND workspace_id=?').bind(pageId, ctx.actor.workspaceId).first<{ container_id: string; page_kind: string }>() : null;
  let kind: string | null = event.action === 'pages.status' ? 'status' : event.target_kind === 'member' || event.target_kind === 'invitation' ? 'member' : ['comment', 'comment-thread'].includes(event.target_kind) ? 'comment' : page ? page.page_kind === 'record' ? 'record' : 'page' : null;
  if (kind === 'status' && await ctx.db.prepare('SELECT id FROM page_verifications WHERE page_id=? AND created_at=?').bind(pageId, event.occurred_at).first()) kind = 'verification';
  return { pageId, page, kind };
}
export async function matchesSubscription(ctx: FeatureContext, subscription: Subscription, event: EventRecord) {
  if (subscription.mode === 'audit') return true;
  const context = await eventContext(ctx, event);
  return !!context.kind && (JSON.parse(subscription.events_json) as string[]).includes(context.kind) && (!context.page || context.page.container_id === subscription.container_id);
}
export async function payloadFor(ctx: FeatureContext, subscription: Subscription, event: EventRecord) {
  await requireWorkspaceOwner(ctx);
  if (subscription.mode === 'audit') {
    const found = await auditRecord(ctx,event.event_id);
    if (!found) return null;
    return { id: event.event_id, type: 'audit', occurredAt: found.occurredAt, actor: found.actor, action: found.action, target: found.target };
  }
  const { pageId, page, kind } = await eventContext(ctx, event);
  if (!kind || !await matchesSubscription(ctx, subscription, event)) return null;
  if (pageId && (!page || !await permitted(() => currentPageTitle(ctx, pageId)))) return null;
  if (kind === 'member' && event.target_kind === 'member' && !await ctx.db.prepare("SELECT id FROM members WHERE id=? AND workspace_id=? AND member_kind='member' AND status='active'").bind(event.target_id, ctx.actor.workspaceId).first()) return null;
  return { id: event.event_id, type: kind, action: event.action, occurredAt: event.occurred_at, target: { kind: event.target_kind, id: event.target_id, ...(pageId ? { pageId, title: await currentPageTitle(ctx, pageId) } : {}) } };
}
/** Cursor advancement and the unique subscription/event enqueue share one atomic batch. */
export async function enqueueEvents(ctx: FeatureContext, subscription: Subscription) {
  const events = await ctx.db.prepare('SELECT e.sequence,e.event_id,a.action,a.target_kind,a.target_id,a.occurred_at FROM webhook_events e JOIN activity_entries a ON a.id=e.event_id WHERE e.workspace_id=? AND e.sequence>? ORDER BY e.sequence LIMIT 100').bind(subscription.workspace_id, subscription.scan_sequence).all<EventRecord>();
  for (const event of events.results) {
    const matched = await matchesSubscription(ctx, subscription, event);
    await ctx.db.batch([
      ...(matched ? [ctx.db.prepare("INSERT OR IGNORE INTO webhook_deliveries(id,subscription_id,event_id,event_sequence,next_attempt_at,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM webhook_subscriptions WHERE id=? AND state='enabled')").bind(`${subscription.id}:${event.event_id}`, subscription.id, event.event_id, event.sequence, ctx.now, ctx.now, subscription.id)] : []),
      ctx.db.prepare('UPDATE webhook_subscriptions SET scan_sequence=max(scan_sequence,?) WHERE id=?').bind(event.sequence, subscription.id),
    ]);
  }
}
