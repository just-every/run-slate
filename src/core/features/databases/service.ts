import { validateDependencies } from "./dependencies";
import { validateFormulas } from "./formulas";
import type { FeatureContext } from "../../app/feature-context";
import { commitOperation, mutationGuard } from "../../app/operations";
import { ApiProblem } from "../../app/problems";
import { createUlid } from "../../shared/ulid";
import { destination, prepareCreatePage, readPage } from "../pages/service";
import { requirePageLevel } from "../sharing/current-access";
import { database, fields, revision, unlocked } from "./repository";
import {
  validateValue,
  evaluateFields,
  aggregate,
  fieldTypes,
  type Field,
  type Values,
} from "./values";
export async function createDatabase(
  ctx: FeatureContext,
  input: {
    operationKey: string;
    containerId: string;
    title: string;
    parentPageId?: string;
  },
) {
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "databases.create",
    request: input,
    authorize: () => destination(ctx, input.containerId, input.parentPageId),
    prepare: async ({ revisionId }) => {
      const id = createUlid(),
        p = await prepareCreatePage(
          ctx,
          { ...input, pageKind: "database" },
          revisionId,
        );
      return {
        entity: { id, kind: "database", revisionId },
        value: { id, pageId: p.value.pageId, revisionId },
        statements: [
          ...p.statements,
          ctx.db
            .prepare(
              "INSERT INTO databases (id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?)",
            )
            .bind(
              id,
              p.value.pageId,
              ctx.actor.workspaceId,
              ctx.now,
              ctx.now,
              revisionId,
            ),
          revision(ctx, revisionId, "database", id, input),
        ],
      };
    },
  });
}
export async function setStructureLock(
  ctx: FeatureContext,
  id: string,
  input: {
    operationKey: string;
    expectedRevisionId: string;
    locked: boolean;
  },
) {
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "databases.lock",
    request: { id, ...input },
    authorize: async () => {
      await database(ctx, id, "full");
    },
    prepare: async ({ revisionId }) => ({
      entity: { id, kind: "database", revisionId },
      value: { id, revisionId, locked: input.locked },
      statements: [
        mutationGuard(
          ctx.db,
          "SELECT revision_id=? FROM databases WHERE id=?",
          [input.expectedRevisionId, id],
        ),
        ctx.db
          .prepare(
            "UPDATE databases SET structure_locked_at=?,structure_locked_by_member_id=?,revision_id=?,updated_at=? WHERE id=?",
          )
          .bind(
            input.locked ? ctx.now : null,
            input.locked ? ctx.actor.id : null,
            revisionId,
            ctx.now,
            id,
          ),
        revision(ctx, revisionId, "database", id, input),
      ],
    }),
  });
}
export async function saveField(
  ctx: FeatureContext,
  id: string,
  input: {
    operationKey: string;
    expectedRevisionId: string;
    field: Field;
    delete?: boolean;
  },
) {
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "databases.field",
    request: { id, ...input },
    authorize: async () => {
      unlocked(await database(ctx, id, "edit"));
    },
    prepare: async ({ revisionId }) => {
      const f = input.field;
      if (
        !fieldTypes.includes(f.type) ||
        !f.name.trim() ||
        !Number.isInteger(f.position) ||
        f.position < 0
      )
        throw new ApiProblem(400, "INVALID_FIELD", "Invalid field definition.");
      const existing = await fields(ctx, id);
      const same = existing.find((x) => x.id === f.id);
      if (
        !same &&
        (await ctx.db
          .prepare("SELECT id FROM database_fields WHERE id=?")
          .bind(f.id)
          .first())
      )
        throw new ApiProblem(
          409,
          "FIELD_ID_CONFLICT",
          "Field identifier already exists.",
        );
      const next = input.delete
        ? existing.filter((x) => x.id !== f.id)
        : [...existing.filter((x) => x.id !== f.id), f];
      if (
        !input.delete &&
        f.type === "formula" &&
        !f.config.expression &&
        same?.type !== "formula"
      )
        throw new ApiProblem(
          400,
          "INVALID_FORMULA",
          "New formulas need a typed expression.",
        );
      validateFormulas(next);
      if (f.type === "relation") {
        if (typeof f.config.databaseId !== "string")
          throw new ApiProblem(
            400,
            "INVALID_RELATION",
            "Choose a relation database.",
          );
        await database(ctx, f.config.databaseId);
      }
      const dependencyGuards = await validateDependencies(ctx, id, next);
      const records = await ctx.db
        .prepare(
          "SELECT page_id,field_values_json FROM database_records WHERE database_id=?",
        )
        .bind(id)
        .all<{
          page_id: string;
          field_values_json: string;
        }>();
      for (const r of records.results) {
        const v = JSON.parse(r.field_values_json);
        if (input.delete && v[f.id] != null)
          throw new ApiProblem(
            409,
            "FIELD_DATA_LOSS",
            "Clear field values before deleting this field.",
          );
        if (same?.type !== f.type && v[f.id] != null) {
          try {
            validateValue(f, v[f.id]);
          } catch {
            throw new ApiProblem(
              409,
              "FIELD_DATA_LOSS",
              "Type change would lose retained values.",
            );
          }
        }
      }
      const write = input.delete
        ? ctx.db
            .prepare("DELETE FROM database_fields WHERE id=? AND database_id=?")
            .bind(f.id, id)
        : ctx.db
            .prepare(
              "INSERT INTO database_fields (id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,field_type=excluded.field_type,config_json=excluded.config_json,position=excluded.position,updated_at=excluded.updated_at,revision_id=excluded.revision_id",
            )
            .bind(
              f.id,
              id,
              f.name,
              f.type,
              JSON.stringify(f.config),
              f.position,
              ctx.now,
              ctx.now,
              revisionId,
            );
      return {
        entity: { id, kind: "database", revisionId },
        value: { id, revisionId, fields: next },
        statements: [
          mutationGuard(
            ctx.db,
            "SELECT revision_id=? AND structure_locked_at IS NULL FROM databases WHERE id=?",
            [input.expectedRevisionId, id],
          ),
          ...dependencyGuards,
          write,
          ctx.db
            .prepare(
              "UPDATE databases SET revision_id=?,updated_at=? WHERE id=?",
            )
            .bind(revisionId, ctx.now, id),
          revision(ctx, revisionId, "database", id, { fields: next }),
        ],
      };
    },
  });
}
export async function validateValues(
  ctx: FeatureContext,
  id: string,
  values: Values,
) {
  const fs = await fields(ctx, id),
    out: Values = {};
  for (const [key, value] of Object.entries(values)) {
    const f = fs.find((f) => f.id === key);
    if (!f) throw new ApiProblem(400, "UNKNOWN_FIELD", "Unknown field.");
    if (["created-at", "updated-at", "identifier"].includes(f.type))
      throw new ApiProblem(
        400,
        "READ_ONLY_FIELD",
        "Metadata fields cannot be assigned.",
      );
    out[key] = validateValue(f, value);
    if (f.type === "person" && Array.isArray(out[key]))
      for (const memberId of out[key] as string[]) {
        if (
          !(await ctx.db
            .prepare(
              "SELECT id FROM members WHERE id=? AND workspace_id=? AND status='active'",
            )
            .bind(memberId, ctx.actor.workspaceId)
            .first())
        )
          throw new ApiProblem(
            400,
            "INVALID_PERSON",
            "Choose an active workspace member.",
          );
      }
    if (f.type === "file" && Array.isArray(out[key]))
      for (const fileId of out[key] as string[]) {
        const file = await ctx.db
          .prepare(
            "SELECT page_id FROM files WHERE id=? AND workspace_id=? AND deleted_at IS NULL",
          )
          .bind(fileId, ctx.actor.workspaceId)
          .first<{
            page_id: string | null;
          }>();
        if (!file?.page_id)
          throw new ApiProblem(404, "NOT_FOUND", "File not found.");
        await requirePageLevel(ctx, file.page_id, "view");
      }
    if (f.type === "relation" && Array.isArray(out[key]))
      for (const target of out[key] as string[]) {
        await requirePageLevel(ctx, target, "view");
        const row = await ctx.db
          .prepare("SELECT database_id FROM database_records WHERE page_id=?")
          .bind(target)
          .first<{
            database_id: string;
          }>();
        if (!row || row.database_id !== f.config.databaseId)
          throw new ApiProblem(
            400,
            "INVALID_RELATION",
            "Relation target is outside its database.",
          );
      }
  }
  return out;
}
export async function createRecord(
  ctx: FeatureContext,
  id: string,
  input: {
    operationKey: string;
    title: string;
    values: Values;
  },
) {
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "databases.record.create",
    request: { id, ...input },
    authorize: async () => {
      await database(ctx, id, "edit");
    },
    prepare: ({ revisionId }) => prepareRecord(ctx, id, input, revisionId),
  });
}
/** One new record page with validated field values and an optional body, under the database's edit check. */
export async function prepareRecord(
  ctx: FeatureContext,
  id: string,
  input: {
    operationKey: string;
    title: string;
    values: Values;
    blocks?: import("../pages/types").BlockInput[];
  },
  revisionId: string,
) {
  const db = await database(ctx, id, "edit"),
    page = await readPage(ctx, db.page_id);
  await destination(ctx, page.page.containerId, db.page_id);
  const values = await validateValues(ctx, id, input.values);
  const p = await prepareCreatePage(
    ctx,
    {
      operationKey: input.operationKey,
      title: input.title,
      containerId: page.page.containerId,
      parentPageId: db.page_id,
      pageKind: "record",
      databaseId: id,
      blocks: input.blocks,
      properties: {
        databaseFields: values as Record<
          string,
          import("../../shared/api/common").JsonValue
        >,
      },
    },
    revisionId,
  );
  return {
    entity: p.entity,
    value: { ...p.value, values },
    statements: [
      mutationGuard(
        ctx.db,
        "SELECT revision_id=? FROM databases WHERE id=?",
        [db.revision_id, id],
      ),
      ...p.statements,
      ctx.db
        .prepare(
          "INSERT INTO database_records (page_id,database_id,field_values_json,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          p.value.pageId,
          id,
          JSON.stringify(values),
          ctx.now,
          ctx.now,
          revisionId,
        ),
      revision(ctx, revisionId, "record", p.value.pageId, values),
    ],
  };
}
