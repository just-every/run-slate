import type { FeatureContext } from '../../app/feature-context';
import type { AppBindings } from '../../app/types';
import { commitOperation } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requireWorkspaceOwner } from '../sharing/current-access';
export async function auditSettings(ctx: FeatureContext) {
  await requireWorkspaceOwner(ctx);
  return await ctx.db.prepare('SELECT retention_days AS retentionDays FROM audit_settings WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{ retentionDays: number }>() ?? { retentionDays: 365 };
}
export async function saveAuditSettings(ctx: FeatureContext, input: { operationKey: string; retentionDays: number }) {
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 365 || !Number.isFinite(new Date(Date.now() - input.retentionDays * 86400000).getTime())) throw new ApiProblem(400, 'RETENTION_FLOOR', 'Keep audit history for at least 365 days and choose a valid duration.');
  return commitOperation(ctx, { operationKey: input.operationKey, action: 'audit.retention', request: input, authorize: () => requireWorkspaceOwner(ctx), prepare: async ({ revisionId }) => ({ entity: { id: ctx.actor.workspaceId, kind: 'workspace', revisionId }, value: { retentionDays: input.retentionDays }, statements: [ctx.db.prepare('INSERT INTO audit_settings(workspace_id,retention_days,updated_by_member_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET retention_days=excluded.retention_days,updated_by_member_id=excluded.updated_by_member_id,updated_at=excluded.updated_at').bind(ctx.actor.workspaceId, input.retentionDays, ctx.actor.id, ctx.now)] }) });
}
export async function pruneAudit(env: AppBindings, now = new Date().toISOString()) {
  const workspaces = await env.DB.prepare('SELECT w.id,COALESCE(a.retention_days,365) AS days FROM workspaces w LEFT JOIN audit_settings a ON a.workspace_id=w.id').all<{ id: string; days: number }>();
  for (const workspace of workspaces.results) await env.DB.prepare("DELETE FROM activity_entries WHERE workspace_id=? AND occurred_at<? AND NOT EXISTS(SELECT 1 FROM webhook_deliveries d WHERE d.event_id=activity_entries.id AND d.state IN ('pending','failed'))").bind(workspace.id, new Date(Date.parse(now) - Math.max(365, workspace.days) * 86400000).toISOString()).run();
}
