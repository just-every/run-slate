import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { permitted } from '../search/visibility';
import { currentSubject, requireWorkspaceOwner } from '../sharing/current-access';
export interface Subscription { id: string; workspace_id: string; member_id: string; container_id: string | null; name: string; destination: string; credential_ciphertext: string | null; events_json: string; mode: 'events' | 'audit'; state: 'enabled' | 'disabled' | 'removed'; scan_sequence: number; created_at: string; last_used_at: string | null; disabled_at: string | null; disabled_reason: string | null; revision_id: string }
export interface Delivery { id: string; subscription_id: string; event_id: string; event_sequence: number; state: string; attempt_count: number; cycle_attempts: number; last_timestamp: number | null; replay_count: number; first_attempt_at: string | null; next_attempt_at: string | null; created_at: string; completed_at: string | null; lease_id: string | null; lease_until: string | null }
export const secretScope = (row: Pick<Subscription, 'workspace_id' | 'id'>) => `${row.workspace_id}:webhook:v1:${row.id}`;
export async function managedSubscription(ctx: FeatureContext, id: string, allowOwn = false) {
  const subject=await currentSubject(ctx);
  if(subject.isGuest)throw new ApiProblem(403,'FORBIDDEN','Guests cannot manage webhook destinations.');
  const row = await ctx.db.prepare('SELECT * FROM webhook_subscriptions WHERE id=? AND workspace_id=?').bind(id, ctx.actor.workspaceId).first<Subscription>();
  if (!row) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
  if(!allowOwn||row.member_id!==ctx.actor.id)await requireWorkspaceOwner(ctx);
  return row;
}
export function subscriptionView({ credential_ciphertext: _secret, ...row }: Subscription) {
  return { id: row.id, memberId: row.member_id, containerId: row.container_id, name: row.name, destination: row.destination, events: JSON.parse(row.events_json) as string[], mode: row.mode, state: row.state, createdAt: row.created_at, lastUsedAt: row.last_used_at, disabledAt: row.disabled_at, disabledReason: row.disabled_reason, revisionId: row.revision_id };
}
export async function subscriptionList(ctx: FeatureContext) {
  if((await currentSubject(ctx)).isGuest)throw new ApiProblem(403,'FORBIDDEN','Guests cannot manage webhook destinations.');
  const owner=await permitted(()=>requireWorkspaceOwner(ctx));
  const rows = await ctx.db.prepare('SELECT s.*,m.display_name AS member_name FROM webhook_subscriptions s JOIN members m ON m.id=s.member_id WHERE s.workspace_id=? AND (? OR s.member_id=?) ORDER BY s.created_at,s.id').bind(ctx.actor.workspaceId,+owner,ctx.actor.id).all<Subscription & {member_name:string}>();
  return { items: rows.results.map(row=>({...subscriptionView(row),memberName:row.member_name})) };
}
export async function deliveryList(ctx: FeatureContext, id: string) {
  await managedSubscription(ctx, id);
  const rows = await ctx.db.prepare('SELECT * FROM webhook_deliveries WHERE subscription_id=? ORDER BY event_sequence DESC LIMIT 100').bind(id).all<Delivery>();
  return { items: await Promise.all(rows.results.map(async row => ({ id: row.id, eventId: row.event_id, state: row.state, replayCount: row.replay_count, nextAttemptAt: row.next_attempt_at, attempts: (await ctx.db.prepare('SELECT attempt,started_at AS startedAt,status,duration_ms AS durationMs,response,outcome,replay FROM webhook_attempts WHERE delivery_id=? ORDER BY attempt').bind(row.id).all()).results }))) };
}
