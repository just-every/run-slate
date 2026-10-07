import { z } from "zod";
import { ApiProblem } from "../../app/problems";
import { fieldTypes } from "./values";
const id = z.string().min(1).max(160),
  key = z.string().min(8).max(160),
  values = z.record(z.string(), z.unknown());
export const databaseInput = z.object({
  operationKey: key,
  containerId: id,
  title: z.string().max(1000),
  parentPageId: id.optional(),
});
export const lockInput = z.object({
  operationKey: key,
  expectedRevisionId: id,
  locked: z.boolean(),
});
export const fieldInput = z.object({
  operationKey: key,
  expectedRevisionId: id,
  delete: z.boolean().optional(),
  field: z.object({
    id,
    name: z.string().min(1).max(200),
    type: z.enum(fieldTypes),
    config: z.record(z.string(), z.unknown()),
    position: z.number().int().min(0),
  }),
});
export const recordCreateInput = z.object({
  operationKey: key,
  title: z.string().max(1000),
  values,
});
export const recordUpdateInput = z.object({
  operationKey: key,
  expectedRevisionId: id,
  values,
});
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiProblem(400, "INVALID_INPUT", "Invalid request.", {
      issues: r.error.issues.map((i) => i.message),
    });
  return r.data;
}
export function validateFilter(
  filter: import("./values").Filter,
  fields: import("./values").Field[],
  depth = 0,
): void {
  if (depth > 32 || !filter || typeof filter !== "object")
    throw new ApiProblem(
      400,
      "INVALID_FILTER",
      "Filter must be a bounded expression.",
    );
  if (filter.and || filter.or) {
    const children = filter.and ?? filter.or;
    if (!Array.isArray(children) || children.length > 100)
      throw new ApiProblem(
        400,
        "INVALID_FILTER",
        "Filter rules must be a bounded array.",
      );
    for (const child of children) validateFilter(child, fields, depth + 1);
    return;
  }
  if (
    !fields.some((f) => f.id === filter.field) ||
    ![
      "eq",
      "ne",
      "contains",
      "gt",
      "gte",
      "lt",
      "lte",
      "empty",
      "not-empty",
    ].includes(filter.op ?? "")
  )
    throw new ApiProblem(
      400,
      "INVALID_FILTER",
      "Filter references an unknown field or operator.",
    );
}
export const viewInput = z.object({
  operationKey: key,
  expectedRevisionId: id,
  delete: z.boolean().optional(),
  view: z.object({
    id,
    name: z.string().min(1).max(200),
    layout: z.enum([
      "table",
      "board",
      "list",
      "gallery",
      "calendar",
      "timeline",
    ]),
    filters: z
      .array(
        z.custom<import("./values").Filter>(
          (v) => !!v && typeof v === "object",
        ),
      )
      .max(100),
    sorts: z
      .array(z.object({ field: id, direction: z.enum(["asc", "desc"]) }))
      .max(100),
    groups: z
      .array(z.object({ field: id, hideEmpty: z.boolean().optional() }))
      .max(10),
    calculations: z.record(z.string(), z.string()),
    display: z.record(z.string(), z.unknown()),
    position: z.number().int().min(0),
  }),
});
