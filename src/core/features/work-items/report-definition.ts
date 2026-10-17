import { z } from 'zod';
import { validDate } from './time';

const identifier = z.string().trim().min(1).max(160);
const date = z.string().refine(validDate, 'Choose a valid date.');

/** Saved criteria only. Reader identities and results are resolved at execution. */
export const taskReportDefinitionSchema = z.object({
  containerId: identifier.optional(),
  ancestorPageId: identifier.optional(),
  label: z.string().trim().min(1).max(80).optional(),
  assignee: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('member'), memberId: identifier }).strict(),
    z.object({ kind: z.literal('current-reader') }).strict(),
  ]).optional(),
  creatorMemberId: identifier.optional(),
  dueFrom: date.optional(),
  dueTo: date.optional(),
  state: z.enum(['open', 'completed']).optional(),
  groupBy: z.enum(['page', 'assignee', 'due']).default('page'),
  orderBy: z.enum(['due', 'page', 'assignee']).default('due'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  limit: z.number().int().min(1).max(100).default(20),
}).strict().refine(value => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo, {
  path: ['dueTo'], message: 'The end date must follow the start date.',
});

export type TaskReportDefinition = z.infer<typeof taskReportDefinitionSchema>;
