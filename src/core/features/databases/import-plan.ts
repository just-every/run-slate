import type { FeatureContext } from "../../app/feature-context";
import type { Field, Values } from "./values";
import { fieldTypes, validateValue } from "./values";
import { ApiProblem } from "../../app/problems";
import { revision } from "./repository";
/** Caller authorizes destination and prepares genuine database/record pages in its same atomic operation. */
export function prepareImportedDatabase(
  ctx: FeatureContext,
  input: {
    id: string;
    pageId: string;
    revisionId: string;
    fields: Field[];
    records: {
      pageId: string;
      values: Values;
      revisionId: string;
    }[];
  },
) {
  const statements = [
    ctx.db
      .prepare(
        "INSERT INTO databases (id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        input.id,
        input.pageId,
        ctx.actor.workspaceId,
        ctx.now,
        ctx.now,
        input.revisionId,
      ),
    revision(ctx, input.revisionId, "database", input.id, input),
  ];
  for (const f of input.fields) {
    if (!fieldTypes.includes(f.type))
      throw new ApiProblem(
        400,
        "UNSUPPORTED_FIELD",
        "Unknown imported field type.",
      );
    statements.push(
      ctx.db
        .prepare(
          "INSERT INTO database_fields (id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          f.id,
          input.id,
          f.name,
          f.type,
          JSON.stringify(f.config),
          f.position,
          ctx.now,
          ctx.now,
          input.revisionId,
        ),
    );
  }
  for (const r of input.records) {
    for (const [id, value] of Object.entries(r.values)) {
      const f = input.fields.find((f) => f.id === id);
      if (!f)
        throw new ApiProblem(400, "UNKNOWN_FIELD", "Unknown imported field.");
      if (!["formula", "rollup"].includes(f.type)) validateValue(f, value);
    }
    statements.push(
      ctx.db
        .prepare(
          "INSERT INTO database_records (page_id,database_id,field_values_json,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          r.pageId,
          input.id,
          JSON.stringify(r.values),
          ctx.now,
          ctx.now,
          r.revisionId,
        ),
      revision(ctx, r.revisionId, "record", r.pageId, r.values),
    );
  }
  return statements;
}
export function prepareImportedRecord(
  ctx: FeatureContext,
  input: {
    databaseId: string;
    pageId: string;
    revisionId: string;
    values: Values;
  },
) {
  return [
    ctx.db
      .prepare(
        "INSERT INTO database_records (page_id,database_id,field_values_json,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        input.pageId,
        input.databaseId,
        JSON.stringify(input.values),
        ctx.now,
        ctx.now,
        input.revisionId,
      ),
    revision(ctx, input.revisionId, "record", input.pageId, input.values),
  ];
}
