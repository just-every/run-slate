import { pageRow, revisionRow } from "../pages/repository";
import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { requirePageLevel } from "../sharing/current-access";
import { fields } from "./repository";
import {
  evaluateFields,
  aggregate,
  type Values,
  type Field,
  type Expression,
} from "./values";
function dependencies(
  expression: Expression,
  out = new Set<string>(),
  depth = 0,
): Set<string> {
  if (depth > 64)
    throw new ApiProblem(
      400,
      "FORMULA_LIMIT",
      "Formula expression exceeds its depth limit.",
    );
  if ("field" in expression) out.add(expression.field);
  else if ("args" in expression)
    for (const arg of expression.args) dependencies(arg, out, depth + 1);
  return out;
}
/** Reader-specific lazy dependencies prevent hidden relations contributing values or counts. */
export async function recordValues(
  ctx: FeatureContext,
  databaseId: string,
  raw: Values,
  definitions?: Field[],
): Promise<Values> {
  const definitionCache = new Map<string, Field[]>();
  if (definitions) definitionCache.set(databaseId, definitions);
  const getFields = async (id: string) => {
    if (!definitionCache.has(id))
      definitionCache.set(id, await fields(ctx, id));
    return definitionCache.get(id)!;
  };
  const active = new Set<string>(),
    cache = new Map<string, unknown>();
  let remaining = 10000;
  async function compute(
    dbId: string,
    recordId: string,
    values: Values,
    fieldId: string,
  ): Promise<unknown> {
    const key = `${dbId}:${recordId}:${fieldId}`;
    if (cache.has(key)) return cache.get(key);
    if (active.has(key))
      throw new ApiProblem(
        409,
        "ROLLUP_CYCLE",
        "Computed field dependencies contain a cycle.",
      );
    if (--remaining < 0 || active.size > 64)
      throw new ApiProblem(
        429,
        "CALCULATION_LIMIT",
        "Computed fields exceed their bounded evaluation budget.",
      );
    active.add(key);
    const fs = await getFields(dbId),
      f = fs.find((f) => f.id === fieldId);
    if (!f)
      throw new ApiProblem(
        409,
        "STALE_FIELD_REFERENCE",
        "A computed field reference no longer exists.",
      );
    let value: unknown = values[fieldId] ?? null;
    if (f.type === "relation" || f.type === "file") {
      const readable: string[] = [];
      for (const target of Array.isArray(value) ? value : []) {
        try {
          if (f.type === "file") {
            const file = await ctx.db
              .prepare(
                "SELECT page_id FROM files WHERE id=? AND workspace_id=? AND deleted_at IS NULL",
              )
              .bind(target, ctx.actor.workspaceId)
              .first<{ page_id: string | null }>();
            if (!file?.page_id) continue;
            await requirePageLevel(ctx, file.page_id, "view");
          } else await requirePageLevel(ctx, target, "view");
          readable.push(target);
        } catch (e) {
          if (!(e instanceof ApiProblem) || e.status !== 404) throw e;
        }
      }
      value = readable;
    }
    if (f.type === "rollup" && f.config.relationField && f.config.targetField) {
      const relation = fs.find(
        (x) => x.id === f.config.relationField && x.type === "relation",
      );
      if (!relation)
        throw new ApiProblem(
          409,
          "STALE_ROLLUP_REFERENCE",
          "Rollup relation field no longer exists.",
        );
      const ids = (await compute(
          dbId,
          recordId,
          values,
          relation.id,
        )) as string[],
        collected: unknown[] = [];
      for (const pageId of ids) {
        const row = await ctx.db
          .prepare(
            "SELECT database_id,field_values_json,created_at,updated_at FROM database_records WHERE page_id=?",
          )
          .bind(pageId)
          .first<{
            database_id: string;
            field_values_json: string;
            created_at: string;
            updated_at: string;
          }>();
        if (!row) continue;
        const targetFields = await getFields(row.database_id),
          target = targetFields.find((x) => x.id === f.config.targetField);
        if (!target)
          throw new ApiProblem(
            409,
            "STALE_ROLLUP_REFERENCE",
            "Rollup target field no longer exists.",
          );
        const access = await requirePageLevel(ctx, pageId, "view");
        const targetPage = await pageRow(ctx, pageId);
        const canEdit = ["edit", "full"].includes(access.decision.level ?? "");
        const targetValues = !canEdit && targetPage.published_revision_id && targetPage.published_revision_id !== targetPage.working_revision_id
          ? JSON.parse((await revisionRow(ctx, pageId, targetPage.published_revision_id)).properties_json).databaseFields ?? {}
          : JSON.parse(row.field_values_json);
        for (const field of targetFields) {
          if (field.type === "created-at")
            targetValues[field.id] = row.created_at;
          if (field.type === "updated-at")
            targetValues[field.id] = row.updated_at;
          if (field.type === "identifier") targetValues[field.id] = pageId;
        }
        collected.push(
          await compute(row.database_id, pageId, targetValues, target.id),
        );
      }
      value = aggregate(collected, String(f.config.calculation ?? "count"));
    }
    if (f.type === "formula" && f.config.expression) {
      const computed: Values = { ...values };
      for (const dep of dependencies(f.config.expression as Expression))
        computed[dep] = await compute(dbId, recordId, values, dep);
      value = evaluateFields(
        fs.map((field) =>
          field.id === f.id
            ? field
            : {
                ...field,
                type: ["formula", "rollup"].includes(field.type)
                  ? "number"
                  : field.type,
              },
        ),
        computed,
      )[f.id];
    }
    active.delete(key);
    cache.set(key, value);
    return value;
  }
  const result: Values = {};
  for (const f of await getFields(databaseId))
    result[f.id] = await compute(databaseId, "root", raw, f.id);
  return result;
}
