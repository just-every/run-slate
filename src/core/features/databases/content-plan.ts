import type { FeatureContext } from "../../app/feature-context";
import type { Values } from "./values";
import { validateValues } from "./service";
import { revision, fields } from "./repository";
/** Content owns authorization and page revision CAS in the enclosing atomic operation. */
export async function prepareRestoreRecordValues(
  ctx: FeatureContext,
  pageId: string,
  revisionId: string,
  values: Values,
) {
  const row = await ctx.db
    .prepare("SELECT database_id FROM database_records WHERE page_id=?")
    .bind(pageId)
    .first<{
      database_id: string;
    }>();
  if (!row) return [];
  const definitions = await fields(ctx,row.database_id);
  const retained = Object.fromEntries(Object.entries(values).filter(([key])=>definitions.some(f=>f.id===key && ["formula","rollup"].includes(f.type))));
  const writable = Object.fromEntries(Object.entries(values).filter(([key])=>!(key in retained)));
  const valid = {...await validateValues(ctx,row.database_id,writable),...retained};
  return [
    ctx.db
      .prepare(
        "UPDATE database_records SET field_values_json=?,revision_id=?,updated_at=? WHERE page_id=?",
      )
      .bind(JSON.stringify(valid), revisionId, ctx.now, pageId),
    revision(ctx, revisionId, "record", pageId, valid),
  ];
}
/** Content calls for all authorized descendant IDs before its physical page deletion. */
export async function prepareDeleteStructuredPages(
  ctx: FeatureContext,
  pageIds: string[],
) {
  const statements: D1PreparedStatement[] = [];
  for (const pageId of pageIds) {
    const databases = await ctx.db
      .prepare("SELECT id FROM databases WHERE page_id=? AND workspace_id=?")
      .bind(pageId, ctx.actor.workspaceId)
      .all<{
        id: string;
      }>();
    statements.push(
      ctx.db.prepare("DELETE FROM structured_page_fields WHERE page_id=?").bind(pageId),
      ctx.db
        .prepare("DELETE FROM database_records WHERE page_id=?")
        .bind(pageId),
    );
    for (const db of databases.results) {
      statements.push(
        ctx.db
          .prepare(
            "UPDATE automation_rules SET source_database_id=NULL,disabled_at=?,disabled_reason='Source database permanently deleted' WHERE source_database_id=?",
          )
          .bind(ctx.now, db.id),
        ctx.db
          .prepare("DELETE FROM database_record_occurrences WHERE template_id IN (SELECT id FROM database_record_templates WHERE database_id=?)")
          .bind(db.id),
        ctx.db
          .prepare("DELETE FROM database_record_templates WHERE database_id=?")
          .bind(db.id),
        ctx.db
          .prepare("DELETE FROM database_records WHERE database_id=?")
          .bind(db.id),
        ctx.db
          .prepare("DELETE FROM database_fields WHERE database_id=?")
          .bind(db.id),
        ctx.db
          .prepare("DELETE FROM database_views WHERE database_id=?")
          .bind(db.id),
        ctx.db.prepare("DELETE FROM databases WHERE id=?").bind(db.id),
      );
    }
    statements.push(
      ctx.db
        .prepare(
          "DELETE FROM structured_revisions WHERE entity_id=? AND workspace_id=?",
        )
        .bind(pageId, ctx.actor.workspaceId),
    );
  }
  return statements;
}
