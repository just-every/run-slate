import { z } from 'zod';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { auditRecord } from './service';
import limits from '../../../../seed.json';
export const auditExportInput = z.object({ operationKey: z.string().min(8).max(160), format: z.enum(['csv', 'json']), from: z.iso.datetime(), to: z.iso.datetime(), actorId: z.string().max(160).optional(), action: z.string().max(160).optional(), targetId: z.string().max(160).optional() }).strict();
export type AuditExportInput = z.infer<typeof auditExportInput>;
const csv = (value: string | null | undefined) => { const text = value ?? ''; return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`; };
export async function exportAudit(ctx: FeatureContext, raw: unknown, authorize: () => Promise<void>) {
  const input = auditExportInput.parse(raw), range = Date.parse(input.to) - Date.parse(input.from);
  if (range < 0 || range > limits.limits.auditExportRangeDays * 86400000) throw new ApiProblem(400, 'AUDIT_EXPORT_RANGE', 'Choose an audit range of at most 31 days.');
  await authorize(); await requireWorkspaceOwner(ctx);
  const admitted = await commitOperation(ctx, { operationKey: input.operationKey, action: 'audit.export', request: input, authorize: () => requireWorkspaceOwner(ctx), prepare: async ({ activityId, revisionId }) => ({ entity: { id: ctx.actor.workspaceId, kind: 'workspace', revisionId }, value: { eventId: activityId }, statements: [] }) });
  const ceiling = await ctx.db.prepare('SELECT sequence FROM webhook_events WHERE event_id=?').bind(admitted.value.eventId).first<number>('sequence');
  if (!ceiling) throw new ApiProblem(503, 'AUDIT_EXPORT_UNAVAILABLE', 'The audit export could not be prepared.');
  const select = `FROM activity_entries a JOIN webhook_events e ON e.event_id=a.id WHERE a.workspace_id=? AND e.sequence<=? AND a.occurred_at>=? AND a.occurred_at<=? AND (? IS NULL OR a.actor_member_id=?) AND (? IS NULL OR a.action=?) AND (? IS NULL OR a.target_id=?)`;
  const values = [ctx.actor.workspaceId, ceiling, input.from, input.to, input.actorId || null, input.actorId || null, input.action || null, input.action || null, input.targetId || null, input.targetId || null];
  const count = await ctx.db.prepare('SELECT count(*) AS n ' + select).bind(...values).first<number>('n');
  if ((count ?? 0) > limits.limits.auditExportRows) throw new ApiProblem(400, 'AUDIT_EXPORT_TOO_LARGE', 'Narrow the filters to export fewer audit entries.');
  const encoder = new TextEncoder(); let cursor = 0, started = false, first = true, ended = false;
  const body = new ReadableStream<Uint8Array>({ async pull(controller) {
    try {
      await authorize(); await requireWorkspaceOwner(ctx);
      if (!started) { started = true; controller.enqueue(encoder.encode(input.format === 'json' ? '[\n' : 'id,actorId,actorName,occurredAt,action,targetKind,targetId\r\n')); return; }
      if (ended) { controller.close(); return; }
      const rows = await ctx.db.prepare('SELECT a.id,e.sequence ' + select + ' AND e.sequence>? ORDER BY e.sequence LIMIT 100').bind(...values, cursor).all<{ id: string; sequence: number }>();
      let chunk = '';
      for (const row of rows.results) {
        cursor = row.sequence; const entry = await auditRecord(ctx, row.id); if (!entry) continue;
        if (input.format === 'json') { chunk += (first ? '' : ',\n') + JSON.stringify(entry); first = false; }
        else chunk += [entry.id, entry.actor?.id, entry.actor?.displayName, entry.occurredAt, entry.action, entry.target.kind, entry.target.id].map(csv).join(',') + '\r\n';
      }
      await authorize();
      if (rows.results.length < 100) { ended = true; if (input.format === 'json') chunk += '\n]\n'; }
      if (chunk) controller.enqueue(encoder.encode(chunk));
      if (ended) controller.close();
    } catch (cause) { controller.error(cause); }
  } });
  return new Response(body, { headers: { 'Content-Type': input.format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="slate-audit.${input.format}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
