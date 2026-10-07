import { z } from "zod";
import type { JsonValue } from "../../shared/api/common";
import type { Filter } from "../databases/values";
const id = z.string().min(1).max(160),
  values = z.record(z.string(), z.unknown());
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("edit-fields"), values }),
  z.object({
    type: z.literal("create-page"),
    containerId: id,
    parentPageId: id.optional(),
    title: z.string().max(1000),
  }),
  z.object({
    type: z.literal("create-record"),
    databaseId: id,
    title: z.string().max(1000),
    values,
  }),
  z.object({
    type: z.literal("move"),
    containerId: id,
    parentPageId: id.optional(),
  }),
  z.object({
    type: z.literal("archive"),
    reason: z.string().max(1000).optional(),
  }),
  z.object({
    type: z.literal("comment"),
    body: z.custom<JsonValue>((v) => typeof v === "string" || Array.isArray(v)),
  }),
  z.object({
    type: z.literal("notify"),
    recipientMemberIds: z.array(id).min(1).max(100),
    message: z.string().min(1).max(2000),
  }),
]);
export const ruleInput = z.object({
  operationKey: z.string().min(8).max(160),
  expectedRevisionId: id.optional(),
  id: id.optional(),
  name: z.string().min(1).max(200),
  scope: z.enum(["source", "container", "site"]),
  sourceDatabaseId: id.optional(),
  containerId: id.optional(),
  trigger: z.object({
    event: z.enum([
      "created",
      "properties",
      "blocks",
      "published",
      "record-created",
      "record-updated",
      "schedule",
    ]),
    intervalMinutes: z.number().int().min(1).optional(),
    startsAt: z.string().optional(),
  }),
  conditions: z
    .array(z.custom<Filter>((v) => !!v && typeof v === "object"))
    .max(100),
  branch: z.object({ relationField: id }).optional(),
  actions: z.array(action).max(50),
  disabled: z.boolean().optional(),
});
