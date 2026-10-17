import { z } from "zod";
import { validDate } from "../work-items/time";
const id = z.string().min(1).max(160),
  key = z.string().min(8).max(160);
export const saveInput = z.object({
  operationKey: key,
  id: id.optional(),
  expectedRevisionId: id.optional(),
  sourcePageId: id,
  includeChildren: z.boolean(),
  containerId: id.nullable(),
  title: z.string().min(1).max(1000),
  description: z.string().max(10000),
  category: z.string().max(100),
});
export const changeInput = z.object({
  operationKey: key,
  expectedRevisionId: id,
  action: z.enum(["archive", "restore", "delete", "move", "duplicate"]),
  containerId: id.nullable().optional(),
});
export const applyInput = z.object({
  operationKey: key,
  containerId: id,
  parentPageId: id.optional(),
  expectedRevisionId: id,
  reviewDate: z.string().refine(validDate, 'Choose a valid review date.').optional(),
});
