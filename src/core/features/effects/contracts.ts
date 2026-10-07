import {z} from 'zod';
const base={operationKey:z.string(),runId:z.string(),grantId:z.string(),connectionId:z.string(),accountId:z.string(),target:z.string(),expectedRevision:z.string(),costMicros:z.literal(0)};
export const effectSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('github.issue.update'),content:z.object({title:z.string().optional(),body:z.string().optional(),state:z.enum(['open','closed']).optional()}).strict()}).strict(),
 z.object({...base,operation:z.literal('happytohelp.article.update'),expectedAudienceRevision:z.string().min(1),content:z.object({title:z.string(),content:z.string(),summary:z.string(),status:z.enum(['draft','published'])}).strict()}).strict(),
 z.object({...base,operation:z.literal('orbit.handoff.upsert'),expectedAudienceRevision:z.string().min(1),content:z.object({title:z.string(),description:z.string(),assigneeId:z.string().nullable(),dueAt:z.string().datetime().nullable(),status:z.enum(['open','completed','cancelled'])}).strict()}).strict(),
]);
export type EffectInput=z.infer<typeof effectSchema>;
const trialBase={subjectId:z.string(),connectionId:z.string(),accountId:z.string(),target:z.string(),expectedRevision:z.string(),audience:z.array(z.string()).default([]),acceptNonAtomicProvider:z.boolean()};
export const trialEffectSchema=z.union([
 z.object({...trialBase,operation:z.literal('github.issue.update').default('github.issue.update'),content:z.object({title:z.string().optional(),body:z.string().optional(),state:z.enum(['open','closed']).optional()}).strict()}).strict(),
 z.object({...trialBase,operation:z.literal('happytohelp.article.update'),expectedAudienceRevision:z.string(),content:z.object({title:z.string(),content:z.string(),summary:z.string(),status:z.enum(['draft','published'])}).strict()}).strict(),
 z.object({...trialBase,operation:z.literal('orbit.handoff.upsert'),expectedAudienceRevision:z.string(),content:z.object({title:z.string(),description:z.string(),assigneeId:z.string().nullable(),dueAt:z.string().datetime().nullable(),status:z.enum(['open','completed','cancelled'])}).strict()}).strict(),
]);
