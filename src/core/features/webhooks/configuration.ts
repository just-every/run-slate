import { z } from 'zod';
import limits from '../../../../seed.json';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { createOpaqueToken } from '../../platform/auth/token';
import { encryptSecret } from '../../platform/secrets/custody';
import { requireWorkspaceOwner, requireContainerLevel } from '../sharing/current-access';
import { validateDestination } from './destination';
import { managedSubscription, secretScope } from './store';
export const eventKinds = ['page', 'record', 'comment', 'status', 'verification', 'member'] as const;
export const subscriptionInput = z.object({ operationKey: z.string().min(8).max(160), name: z.string().trim().min(1).max(80), containerId: z.string().min(1), destination: z.string().url().max(2048), events: z.array(z.enum(eventKinds)).min(1).max(6) }).strict();
export async function subscribe(ctx: FeatureContext, raw: unknown, mode: 'events' | 'audit' = 'events') {
  const input = subscriptionInput.parse(raw);
  await requireWorkspaceOwner(ctx); await requireContainerLevel(ctx, input.containerId, 'view');
  if((await ctx.db.prepare("SELECT count(*) AS n FROM webhook_subscriptions WHERE state!='removed'").first<number>('n'))!>=limits.limits.webhookSubscriptionsPerDeployment)throw new ApiProblem(409,'WEBHOOK_LIMIT','Remove an unused destination before adding another.');
  await validateDestination(input.destination);
  if (!ctx.sourceSecret) throw new ApiProblem(503, 'CREDENTIAL_UNAVAILABLE', 'A credential sealing key must be configured before adding a destination.');
  const id = createUlid(), secret = createOpaqueToken(), cipher = await encryptSecret(ctx.sourceSecret, secret, secretScope({ id, workspace_id: ctx.actor.workspaceId }));
  const result = await commitOperation(ctx, { operationKey: input.operationKey, action: 'webhook.subscribe', request: { ...input, mode }, authorize: () => requireWorkspaceOwner(ctx), prepare: async ({ revisionId }) => ({ entity: { id, kind: 'webhook', revisionId }, value: { id }, detail: { name: input.name }, statements: [
    mutationGuard(ctx.db,"SELECT count(*)<? FROM webhook_subscriptions WHERE state!='removed'",[limits.limits.webhookSubscriptionsPerDeployment]),
    ctx.db.prepare("INSERT INTO webhook_subscriptions(id,workspace_id,member_id,container_id,name,destination,credential_ciphertext,events_json,mode,scan_sequence,created_at,revision_id) VALUES(?,?,?,?,?,?,?,?,?,(SELECT COALESCE(max(sequence),0) FROM webhook_events),?,?)").bind(id, ctx.actor.workspaceId, ctx.actor.id, input.containerId, input.name, input.destination, cipher, JSON.stringify([...new Set(input.events)]), mode, ctx.now, revisionId),
  ] }) });
  return { ...result, ...(result.value.id === id ? { secret } : {}) };
}
export async function changeSubscription(ctx: FeatureContext, id: string, operationKey: string, action: 'enable' | 'remove') {
  const row = await managedSubscription(ctx, id, action === 'remove');
  if (action === 'enable') {
    if (!row.credential_ciphertext || row.state === 'removed') throw new ApiProblem(409, 'RECONNECT_REQUIRED', 'Create a fresh destination and save its new signing secret.');
    await validateDestination(row.destination);
    if (!await ctx.db.prepare("SELECT id FROM members WHERE id=? AND role='owner' AND member_kind='member' AND status='active'").bind(row.member_id).first()) throw new ApiProblem(409, 'ACTING_OWNER_UNAVAILABLE', 'Create a destination under a current owner.');
  }
  return commitOperation(ctx, { operationKey, action: `webhook.${action}`, request: { id }, authorize: async () => {await managedSubscription(ctx,id,action==='remove');}, prepare: async ({ revisionId }) => ({ entity: { id, kind: 'webhook', revisionId }, value: { changed: true }, statements: [
    mutationGuard(ctx.db, 'SELECT revision_id=? FROM webhook_subscriptions WHERE id=?', [row.revision_id, id]),
    ctx.db.prepare("UPDATE webhook_subscriptions SET state=?,credential_ciphertext=CASE WHEN ?='removed' THEN NULL ELSE credential_ciphertext END,disabled_at=NULL,disabled_reason=NULL,revision_id=? WHERE id=?").bind(action === 'enable' ? 'enabled' : 'removed', action === 'enable' ? 'enabled' : 'removed', revisionId, id),
  ] }) });
}
export async function replayDelivery(ctx: FeatureContext, subscriptionId: string, id: string, operationKey: string) {
  const subscription = await managedSubscription(ctx, subscriptionId);
  if (subscription.state !== 'enabled') throw new ApiProblem(409, 'WEBHOOK_DISABLED', 'Re-enable this destination before replaying a delivery.');
  return commitOperation(ctx, { operationKey, action: 'webhook.replay', request: { subscriptionId, id }, authorize: () => requireWorkspaceOwner(ctx), prepare: async ({ revisionId }) => ({ entity: { id: subscriptionId, kind: 'webhook', revisionId }, value: { replayed: true }, statements: [
    mutationGuard(ctx.db, "SELECT state!='pending' FROM webhook_deliveries WHERE id=? AND subscription_id=?", [id, subscriptionId]),
    ctx.db.prepare("UPDATE webhook_deliveries SET state='pending',replay_count=replay_count+1,first_attempt_at=NULL,cycle_attempts=0,next_attempt_at=?,completed_at=NULL,lease_id=NULL,lease_until=NULL WHERE id=? AND subscription_id=?").bind(ctx.now, id, subscriptionId),
  ] }) });
}
