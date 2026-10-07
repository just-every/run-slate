import {z} from 'zod';
import {evidenceSchema} from '../ai/contracts';
const scoped=z.string().min(1).max(2000).nullable();
export const claimScopeSchema=z.object({account:scoped,product:scoped,plan:scoped,audience:z.array(z.string()).min(1),jurisdiction:scoped,effectiveAt:z.string().datetime().nullable(),expiresAt:z.string().datetime().nullable()}).strict().refine(s=>!s.effectiveAt||!s.expiresAt||s.effectiveAt<s.expiresAt,'Expiry must follow the effective date');
export const claimAuthoritySchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('none')}).strict(),z.object({kind:z.literal('accepted-decision'),decisionId:z.string(),revisionId:z.string(),applicability:z.string().min(1).max(4000),delegatedOffice:scoped}).strict()]);
export const claimRecordSchema=z.object({pageId:z.string(),runId:z.string(),statementIndex:z.number().int().nonnegative(),proposition:z.string(),kind:z.enum(['observation','assumption','deduction','unknown']),ownerId:z.string(),scope:claimScopeSchema,passages:z.array(z.object({ref:evidenceSchema,quote:z.string()}).strict()).min(1),verification:z.literal('unverified'),conflicts:z.array(z.string()),unknowns:z.array(z.string()),authority:claimAuthoritySchema,approvingPersonId:z.string().nullable(),supersedesRevisionId:z.string().nullable()}).strict();
export type ClaimRecord=z.infer<typeof claimRecordSchema>;
