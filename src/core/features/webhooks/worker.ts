import limits from '../../../../seed.json';
import type { AppBindings } from '../../app/types';
import type { FeatureContext } from '../../app/feature-context';
import { createMemberRepository } from '../session/repository';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { notificationStatements } from '../notifications/events';
import { processNotificationOutbox } from '../notifications/outbox';
import { createUlid } from '../../shared/ulid';
import { enqueueEvents, eventRecord, payloadFor } from './events';
import { signedExchange } from './transport';
import type { Subscription, Delivery } from './store';
const retrySeconds = [60, 300, 1800, 7200, 21600, 43200, 86400];
async function disable(ctx: FeatureContext, subscription: Subscription) {
  const owners = (await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND role='owner' AND member_kind='member' AND status='active'").bind(subscription.workspace_id).all<{ id: string }>()).results.map(m => m.id);
  // System-origin notice avoids suppressing a notice to the acting owner themselves.
  await ctx.db.batch([ctx.db.prepare("UPDATE webhook_subscriptions SET state='disabled',disabled_at=?,disabled_reason='Delivery retries exhausted after 24 hours.' WHERE id=? AND state='enabled'").bind(ctx.now,subscription.id),...notificationStatements(ctx, { id: `webhook-disabled:${subscription.id}:${subscription.revision_id}`, event: 'reminder', recipientIds: owners, actorId: null, detail: { outcome: `Webhook ${subscription.name} was disabled after its delivery retries failed. Open Developer access to inspect it.` } })]);
  await processNotificationOutbox(ctx);
}
export async function deliverPending(ctx: FeatureContext, subscription: Subscription) {
  const due = await ctx.db.prepare("SELECT * FROM webhook_deliveries WHERE subscription_id=? AND state='pending' AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY event_sequence LIMIT 20").bind(subscription.id, ctx.now, ctx.now).all<Delivery>();
  for (const candidate of due.results) {
    // Audit destinations wait for the oldest event; a failed event blocks later ones.
    if (subscription.mode === 'audit' && await ctx.db.prepare("SELECT id FROM webhook_deliveries WHERE subscription_id=? AND state IN ('pending','failed') AND event_sequence<? LIMIT 1").bind(subscription.id, candidate.event_sequence).first()) break;
    const lease = createUlid();
    const delivery = await ctx.db.prepare("UPDATE webhook_deliveries SET lease_id=?,lease_until=?,attempt_count=attempt_count+1,cycle_attempts=cycle_attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),last_timestamp=max(COALESCE(last_timestamp,0)+1,?) WHERE id=? AND state='pending' AND (lease_until IS NULL OR lease_until<?) AND EXISTS(SELECT 1 FROM webhook_subscriptions WHERE id=? AND state='enabled' AND credential_ciphertext IS NOT NULL) RETURNING *").bind(lease, new Date(Date.parse(ctx.now) + 30000).toISOString(), ctx.now, Math.floor(Date.parse(ctx.now) / 1000), candidate.id, ctx.now, subscription.id).first<Delivery>();
    if (!delivery) continue;
    const started=Date.now();
    let result = { status: null as number | null, durationMs: 0, response: '', outcome: 'withheld' };
    try {
      result = await signedExchange(subscription, delivery, ctx.sourceSecret ?? '', async () => {
        const current = await ctx.db.prepare('SELECT * FROM webhook_subscriptions WHERE id=?').bind(subscription.id).first<Subscription>();
        await requireWorkspaceOwner(ctx);
        const event = await eventRecord(ctx, delivery.event_id);
        return current?.state === 'enabled' && current.member_id === ctx.actor.id && event ? payloadFor(ctx,current,event) : null;
      });
    } catch { result = { status: null, durationMs: Date.now()-started, response: '', outcome: 'transport-failed' }; }
    const first = Date.parse(delivery.first_attempt_at!), exhausted = Date.parse(ctx.now) >= first + 86400000 || delivery.cycle_attempts > retrySeconds.length;
    const terminal = ['sent', 'withheld'].includes(result.outcome) || exhausted;
    const state = result.outcome === 'sent' ? 'sent' : result.outcome === 'withheld' ? 'withheld' : terminal ? 'failed' : 'pending';
    const next = terminal ? null : new Date(first + retrySeconds[delivery.cycle_attempts - 1]! * 1000).toISOString();
    await ctx.db.batch([
      ctx.db.prepare('INSERT OR IGNORE INTO webhook_attempts(delivery_id,attempt,started_at,status,duration_ms,response,outcome,replay) VALUES(?,?,?,?,?,?,?,?)').bind(delivery.id, delivery.attempt_count, ctx.now, result.status, result.durationMs, result.response, result.outcome, +!!delivery.replay_count),
      ctx.db.prepare('UPDATE webhook_deliveries SET state=?,completed_at=?,next_attempt_at=?,lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=?').bind(state, terminal ? ctx.now : null, next, delivery.id, lease),
      ...(result.outcome !== 'withheld' ? [ctx.db.prepare('UPDATE webhook_subscriptions SET last_used_at=? WHERE id=?').bind(ctx.now, subscription.id)] : []),
    ]);
    if (state === 'failed') { await disable(ctx, subscription); break; }
    if (subscription.mode === 'audit' && state === 'pending') break;
  }
}
export async function scheduleWebhooks(env: AppBindings, now = new Date().toISOString()) {
  const subscriptions = await env.DB.prepare("SELECT * FROM webhook_subscriptions WHERE state='enabled' ORDER BY id LIMIT 100").all<Subscription>();
  for (const subscription of subscriptions.results) {
    const actor = await createMemberRepository(env.DB).getMember(subscription.member_id);
    if (!actor || actor.role !== 'owner') { await env.DB.prepare("UPDATE webhook_subscriptions SET state='disabled',disabled_at=?,disabled_reason='Acting owner is unavailable.' WHERE id=?").bind(now, subscription.id).run(); continue; }
    const ctx: FeatureContext = { db: env.DB, files: env.FILES, jobs: env.JOBS, actor, now, sourceSecret: env.CONNECTOR_CREDENTIALS_KEY };
    await requireWorkspaceOwner(ctx);
    await enqueueEvents(ctx, subscription);
    await deliverPending(ctx, subscription);
  }
  await env.DB.prepare("DELETE FROM webhook_deliveries WHERE completed_at<? AND (state IN ('sent','withheld') OR subscription_id IN (SELECT id FROM webhook_subscriptions WHERE state='removed'))").bind(new Date(Date.parse(now)-limits.limits.webhookLogRetentionDays*86400000).toISOString()).run();
}
