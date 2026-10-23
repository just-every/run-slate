import type { FeatureContext } from "../../app/feature-context";
import { commitOperation, mutationGuard } from "../../app/operations";
import { ApiProblem } from "../../app/problems";
import { createUlid } from "../../shared/ulid";
import { validateBlockTree } from "../editor/validation";
import type { BlockInput } from "../pages/types";
import { labelForReader } from "../pages/mentions";
import { validTimezone } from "../work-items/time";
import { database, revision } from "./repository";
import { nextOccurrence, validateRecurrence, type Recurrence } from "./recurrence";
import { prepareRecord, validateValues } from "./service";
import type { Values } from "./values";
/** DB-015: a database's record templates. Viewers of the database see them; editors manage and use them. */
export interface RecordTemplateRow {
  id: string;
  workspace_id: string;
  database_id: string;
  name: string;
  record_title: string;
  values_json: string;
  blocks_json: string;
  recurrence_json: string | null;
  timezone: string | null;
  next_occurrence_at: string | null;
  creator_member_id: string; // the member who last saved the template: the schedule runs as them
  last_saver_name: string | null;
  paused_at: string | null;
  paused_reason: string | null;
  revision_id: string;
}
export interface RecordTemplateInput {
  operationKey: string;
  id?: string;
  expectedRevisionId?: string;
  name: string;
  title: string;
  values: Values;
  blocks: BlockInput[];
  recurrence: Recurrence | null;
}
const view = (r: RecordTemplateRow) => {
  const lastSaver = { id: r.creator_member_id, name: r.last_saver_name };
  return {
    id: r.id,
    databaseId: r.database_id,
    name: r.name,
    title: r.record_title,
    values: JSON.parse(r.values_json) as Values,
    blocks: JSON.parse(r.blocks_json) as BlockInput[],
    recurrence: r.recurrence_json ? (JSON.parse(r.recurrence_json) as Recurrence) : null,
    timezone: r.timezone,
    nextOccurrenceAt: r.paused_at ? null : r.next_occurrence_at,
    lastSaver,
    /** Deprecated alias of lastSaver, kept for clients written before the rename: the member is the last saver, not the original creator. */
    creator: lastSaver,
    pausedAt: r.paused_at,
    pausedReason: r.paused_reason,
    revisionId: r.revision_id,
  };
};
const SELECT = "SELECT t.*,m.display_name AS last_saver_name FROM database_record_templates t LEFT JOIN members m ON m.id=t.creator_member_id";
export async function templateRow(ctx: FeatureContext, databaseId: string, id: string) {
  const row = await ctx.db.prepare(`${SELECT} WHERE t.id=? AND t.database_id=? AND t.workspace_id=?`).bind(id, databaseId, ctx.actor.workspaceId).first<RecordTemplateRow>();
  if (!row) throw new ApiProblem(404, "NOT_FOUND", "Not found.");
  return row;
}
export async function listRecordTemplates(ctx: FeatureContext, databaseId: string) {
  await database(ctx, databaseId, "view");
  const rows = await ctx.db.prepare(`${SELECT} WHERE t.database_id=? AND t.workspace_id=? ORDER BY t.name,t.id`).bind(databaseId, ctx.actor.workspaceId).all<RecordTemplateRow>();
  // A template keeps the mention labels its saver saw; each reader sees their own.
  return { items: await Promise.all(rows.results.map(async (row) => { const item = view(row); return { ...item, blocks: await labelForReader(ctx, item.blocks) }; })) };
}
/** The schedule runs in its last saver's personal time zone (navigation preferences), captured when the schedule is saved. */
export async function memberTimezone(ctx: FeatureContext, memberId: string) {
  const row = await ctx.db.prepare("SELECT value_json FROM discovery_preferences WHERE member_id=?").bind(memberId).first<{ value_json: string }>();
  const zone = row ? (JSON.parse(row.value_json) as { timezone?: string }).timezone : undefined;
  return zone && validTimezone(zone) ? zone : "UTC";
}
/** Saving a template makes the saver its last saver, the identity its schedule acts as; saving resumes a paused schedule from now. */
export async function saveRecordTemplate(ctx: FeatureContext, databaseId: string, input: RecordTemplateInput) {
  if (!input.name.trim()) throw new ApiProblem(400, "INVALID_TEMPLATE", "Name the template.");
  const recurrence = input.recurrence ? validateRecurrence(input.recurrence) : null;
  const blocks = validateBlockTree(input.blocks);
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "databases.template.save",
    request: { databaseId, ...input },
    authorize: async () => {
      await database(ctx, databaseId, "edit");
      if (input.id) await templateRow(ctx, databaseId, input.id);
    },
    prepare: async ({ revisionId }) => {
      const values = await validateValues(ctx, databaseId, input.values);
      const timezone = recurrence ? await memberTimezone(ctx, ctx.actor.id) : null;
      const next = recurrence ? nextOccurrence(recurrence, timezone!, ctx.now) : null;
      const id = input.id ?? createUlid();
      return {
        entity: { id, kind: "record-template", revisionId },
        value: { id, revisionId, nextOccurrenceAt: next, timezone },
        statements: [
          ...(input.id ? [mutationGuard(ctx.db, "SELECT revision_id=? AND database_id=? FROM database_record_templates WHERE id=?", [input.expectedRevisionId ?? "", databaseId, id])] : []),
          ctx.db
            .prepare(
              "INSERT INTO database_record_templates (id,workspace_id,database_id,name,record_title,values_json,blocks_json,recurrence_json,timezone,next_occurrence_at,creator_member_id,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,record_title=excluded.record_title,values_json=excluded.values_json,blocks_json=excluded.blocks_json,recurrence_json=excluded.recurrence_json,timezone=excluded.timezone,next_occurrence_at=excluded.next_occurrence_at,creator_member_id=excluded.creator_member_id,paused_at=NULL,paused_reason=NULL,updated_at=excluded.updated_at,revision_id=excluded.revision_id",
            )
            .bind(id, ctx.actor.workspaceId, databaseId, input.name.trim(), input.title, JSON.stringify(values), JSON.stringify(blocks), recurrence ? JSON.stringify(recurrence) : null, timezone, next, ctx.actor.id, ctx.now, ctx.now, revisionId),
          revision(ctx, revisionId, "record-template", id, { ...input, values, recurrence, timezone }),
        ],
      };
    },
  });
}
export async function deleteRecordTemplate(ctx: FeatureContext, databaseId: string, id: string, input: { operationKey: string; expectedRevisionId: string }) {
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "databases.template.delete",
    request: { databaseId, id, ...input },
    authorize: async () => {
      await database(ctx, databaseId, "edit");
      await templateRow(ctx, databaseId, id);
    },
    prepare: async ({ revisionId }) => ({
      entity: { id, kind: "record-template", revisionId },
      value: { id, deleted: true },
      statements: [
        mutationGuard(ctx.db, "SELECT revision_id=? FROM database_record_templates WHERE id=?", [input.expectedRevisionId, id]),
        ctx.db.prepare("DELETE FROM database_record_occurrences WHERE template_id=?").bind(id),
        ctx.db.prepare("DELETE FROM database_record_templates WHERE id=?").bind(id),
        ctx.db.prepare("DELETE FROM structured_revisions WHERE entity_id=? AND workspace_id=?").bind(id, ctx.actor.workspaceId),
      ],
    }),
  });
}
/** A record from the template's current defaults and body, with fresh block identities. An occurrence is recorded in the same batch. */
export async function createFromTemplate(ctx: FeatureContext, databaseId: string, id: string, input: { operationKey: string }, occurrenceAt?: string) {
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "databases.record.create",
    request: { databaseId, templateId: id, occurrenceAt },
    authorize: async () => {
      await database(ctx, databaseId, "edit");
    },
    prepare: async ({ revisionId }) => {
      const t = await templateRow(ctx, databaseId, id);
      const source = JSON.parse(t.blocks_json) as BlockInput[], ids = new Map(source.map((b) => [b.id, createUlid()]));
      const blocks = source.map((b) => ({ ...b, id: ids.get(b.id)!, parentBlockId: b.parentBlockId ? ids.get(b.parentBlockId) ?? null : null }));
      const plan = await prepareRecord(ctx, databaseId, { operationKey: input.operationKey, title: t.record_title, values: JSON.parse(t.values_json), blocks }, revisionId);
      if (occurrenceAt) {
        const next = nextOccurrence(JSON.parse(t.recurrence_json!), t.timezone!, occurrenceAt);
        plan.statements.push(
          ctx.db.prepare("INSERT INTO database_record_occurrences (template_id,occurrence_at,record_page_id,created_at) VALUES (?,?,?,?)").bind(id, occurrenceAt, plan.value.pageId, ctx.now),
          ctx.db.prepare("UPDATE database_record_templates SET next_occurrence_at=? WHERE id=? AND next_occurrence_at=?").bind(next, id, occurrenceAt),
        );
      }
      return plan;
    },
  });
}
