import type { FeatureContext } from "../../app/feature-context";
import type { JsonValue } from "../../shared/api/common";
import { commitOperation, mutationGuard } from "../../app/operations";
import { ApiProblem } from "../../app/problems";
import { requirePageLevel } from "../sharing/current-access";
import { readPage } from "../pages/service";
import { prepareRecordProperties } from "../pages/record-properties";
import { validateValues } from "./service";
import { fields, revision } from "./repository";
import { recordValues } from "./views";
import type { Values } from "./values";
export async function openRecord(ctx: FeatureContext, pageId: string) {
  const page = await readPage(ctx, pageId);
  const row = await ctx.db
    .prepare(
      "SELECT database_id,field_values_json,revision_id,created_at,updated_at FROM database_records WHERE page_id=?",
    )
    .bind(pageId)
    .first<{
      database_id: string;
      field_values_json: string;
      revision_id: string;
      created_at: string;
      updated_at: string;
    }>();
  if (!row) throw new ApiProblem(404, "NOT_FOUND", "Not found.");
  const definitions = await fields(ctx, row.database_id),
    raw =
      !page.permissions.canEdit &&
      page.publishedRevisionId &&
      page.publishedRevisionId !== page.workingRevisionId
        ? { ...(page.properties.databaseFields ?? {}) }
        : JSON.parse(row.field_values_json);
  for (const f of definitions) {
    if (f.type === "created-at") raw[f.id] = page.createdAt;
    if (f.type === "updated-at") raw[f.id] = page.updatedAt;
    if (f.type === "identifier") raw[f.id] = pageId;
  }
  return {
    page,
    fields: definitions.map((f) => ({
      ...f,
      editable: page.permissions.canEdit && !f.readOnly,
    })),
    values: await recordValues(ctx, row.database_id, raw),
    revisionId: page.page.revisionId,
    parity: page.policyProfile["record.page-parity.v1"],
    presentation:
      page.policyProfile["record.page-parity.v1"] === "record-is-page"
        ? {
            body: true,
            icon: true,
            tree: true,
            modes: ["side-peek", "centre-peek", "full-page"],
          }
        : { body: false, icon: false, tree: false, modes: ["fields", "print"] },
  };
}
export async function updateRecord(
  ctx: FeatureContext,
  pageId: string,
  input: {
    operationKey: string;
    expectedRevisionId: string;
    values: Values;
  },
) {
  const result = await commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "databases.record.update",
    request: { pageId, ...input },
    authorize: async () => {
      await requirePageLevel(ctx, pageId, "edit");
    },
    prepare: async ({ revisionId }) => {
      const row = await ctx.db
        .prepare(
          "SELECT database_id,field_values_json,revision_id,created_at,updated_at FROM database_records WHERE page_id=?",
        )
        .bind(pageId)
        .first<{
          database_id: string;
          field_values_json: string;
          revision_id: string;
        }>();
      if (!row) throw new ApiProblem(404, "NOT_FOUND", "Not found.");
      const structure = await ctx.db
        .prepare("SELECT revision_id FROM databases WHERE id=?")
        .bind(row.database_id)
        .first<{
          revision_id: string;
        }>();
      const changes = await validateValues(ctx, row.database_id, input.values),
        values = { ...JSON.parse(row.field_values_json), ...changes };
      const plan = await prepareRecordProperties(
        ctx,
        pageId,
        input.expectedRevisionId,
        revisionId,
        values as Record<string, JsonValue>,
      );
      return {
        ...plan,
        value: { pageId, revisionId, values },
        statements: [
          ...plan.statements,
          mutationGuard(
            ctx.db,
            "SELECT revision_id=? FROM databases WHERE id=?",
            [structure!.revision_id, row.database_id],
          ),
          mutationGuard(
            ctx.db,
            "SELECT revision_id=? FROM database_records WHERE page_id=?",
            [row.revision_id, pageId],
          ),
          ctx.db
            .prepare(
              "UPDATE database_records SET field_values_json=?,updated_at=?,revision_id=? WHERE page_id=?",
            )
            .bind(JSON.stringify(values), ctx.now, revisionId, pageId),
          revision(ctx, revisionId, "record", pageId, values),
        ],
      };
    },
  });
  const row = await ctx.db.prepare("SELECT database_id FROM database_records WHERE page_id=?").bind(pageId).first<{database_id:string}>();
  return {...result, value:{...result.value,values: await recordValues(ctx,row!.database_id,result.value.values)}};
}
