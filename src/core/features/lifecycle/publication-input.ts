import { z } from 'zod';
const identifier = z.string().min(1).max(200);
export const publicationSchema = z.object({
  operationKey: z.string(), expectedRevisionId: identifier,
  previewFingerprint: z.string().min(1).optional(),
  label: z.string().max(2000).optional(), publishAt: z.iso.datetime().optional(),
  publishAsMemberId: identifier.optional(),
  destination: z.object({ containerId: identifier, parentPageId: identifier.nullable(), treePosition: z.string().min(1).max(1000) }).strict().optional(),
  generalAccess: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('restricted') }).strict(),
    z.object({ kind: z.enum(['workspace', 'container']), level: z.enum(['view', 'comment', 'edit', 'full']) }).strict(),
  ]).optional(),
}).strict();
export const publicationPreviewSchema = publicationSchema.omit({ operationKey: true, previewFingerprint: true }).extend({ operationKey: z.string().optional() });
export type PublicationInput = z.infer<typeof publicationSchema>;
export interface RetainedGeneralGrant { id: string; principal_kind: 'workspace'|'container'; principal_id: string; level: string; revision_id: string|null; expires_at: string|null }
export interface ScheduledChoices {
  review?: import('./publication-preview').PublicationReleaseReview;
  destination?: PublicationInput['destination']; generalAccess?: PublicationInput['generalAccess'];
  publishAsMemberId?: string; retainedGeneralGrantsUpdatedAt?: string; retainedGeneralGrants?: RetainedGeneralGrant[];
}
export interface PublicationSchedule {
  page_id: string; publish_at: string; actor_member_id: string; expected_revision_id: string;
  operation_key: string; label: string|null; publication_json: string|null;
}
