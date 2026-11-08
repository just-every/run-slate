import { z } from 'zod';
import type { Filter } from '../databases/values';

const id = z.string().min(1).max(160);
function boundedFilter(value: unknown, depth = 0): value is Filter {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 8) return false;
  const filter = value as Filter;
  const children = filter.and ?? filter.or;
  if (children) return Array.isArray(children) && children.length <= 100 && children.every(child => boundedFilter(child, depth + 1));
  return typeof filter.field === 'string' && filter.field.length <= 160
    && ['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'empty', 'not-empty'].includes(filter.op ?? '');
}
export const embeddedViewCriteriaSchema = z.object({
  filters: z.array(z.custom<Filter>(value => boundedFilter(value))).max(100).default([]),
  sorts: z.array(z.object({ field: id, direction: z.enum(['asc', 'desc']) }).strict()).max(100).optional(),
});
export const databaseViewDefinitionSchema = embeddedViewCriteriaSchema.extend({
  databaseId: id.optional(),
  viewId: id.optional(),
}).strict().refine(value => !!value.databaseId === !!value.viewId, 'Choose a database and a saved view.');
export type DatabaseViewDefinition = z.infer<typeof databaseViewDefinitionSchema>;
export const embeddedViewQuerySchema = embeddedViewCriteriaSchema.extend({ pageId: id }).strict();
