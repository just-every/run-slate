import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { database } from "./repository";
import { createFromTemplate, type RecordTemplateRow } from "./record-templates";
const pause = (ctx: FeatureContext, id: string, reason: string) =>
  ctx.db.prepare("UPDATE database_record_templates SET paused_at=?,paused_reason=? WHERE id=? AND paused_at IS NULL").bind(ctx.now, reason, id).run();
/** The last saver's own identity: a schedule never borrows the maintenance runner's grants. */
async function saverContext(ctx: FeatureContext, t: RecordTemplateRow): Promise<FeatureContext | null> {
  const actor = await ctx.db
    .prepare("SELECT m.id,m.workspace_id AS workspaceId,w.name AS workspaceName,m.email,m.display_name AS displayName,m.initials,m.role FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=? AND m.workspace_id=? AND m.status='active'")
    .bind(t.creator_member_id, t.workspace_id)
    .first<FeatureContext["actor"]>();
  return actor ? { ...ctx, actor, authorizationEpoch: undefined } : null;
}
/**
 * DB-015: create one record for every due occurrence of every running schedule in this workspace, as the schedule's
 * last saver. Missed occurrences (the runner was down) are created on the next pass. The occurrence row and the record
 * commit together, so a repeated or restarted pass finds the occurrence taken and never creates a second record.
 * A schedule whose last saver can no longer create records here pauses with its reason; saving it again resumes it.
 */
export async function runRecurringRecords(ctx: FeatureContext, limit = 50) {
  const due = await ctx.db
    .prepare("SELECT t.*,m.display_name AS last_saver_name FROM database_record_templates t LEFT JOIN members m ON m.id=t.creator_member_id WHERE t.workspace_id=? AND t.recurrence_json IS NOT NULL AND t.paused_at IS NULL AND t.next_occurrence_at<=? ORDER BY t.next_occurrence_at LIMIT ?")
    .bind(ctx.actor.workspaceId, ctx.now, limit)
    .all<RecordTemplateRow>();
  let created = 0;
  for (const t of due.results) {
    const name = t.last_saver_name ?? "The schedule's last saver";
    const acting = await saverContext(ctx, t);
    if (!acting) {
      await pause(ctx, t.id, `Paused: ${name} is no longer an active member. Save the schedule again to resume it as yourself.`);
      continue;
    }
    let occurrence: string | null = t.next_occurrence_at;
    while (occurrence && occurrence <= ctx.now && created < limit) {
      try {
        await database(acting, t.database_id, "edit");
        await createFromTemplate(acting, t.database_id, t.id, { operationKey: `recurring:${t.id}:${occurrence}` }, occurrence);
        created++;
      } catch (error) {
        if (!(error instanceof ApiProblem)) throw error;
        if (error.code !== "ENTITY_CONFLICT") {
          await pause(ctx, t.id, [401, 403, 404].includes(error.status)
            ? `Paused: ${name} can no longer add records to this database. Save the schedule again to resume it as yourself.`
            : `Paused: ${error.message}`);
          break;
        }
      }
      const row = await ctx.db.prepare("SELECT next_occurrence_at,paused_at FROM database_record_templates WHERE id=?").bind(t.id).first<{ next_occurrence_at: string | null; paused_at: string | null }>();
      if (!row || row.paused_at || row.next_occurrence_at === occurrence) break;
      occurrence = row.next_occurrence_at;
    }
  }
  return { created };
}
