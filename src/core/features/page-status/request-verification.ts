import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel } from '../sharing/current-access';
import { requestRow } from './request-access';
import { bulkReviewOwner } from './request-queue';
import type { ReviewRequestCAS } from './request-types';
import { setPageStatus } from './service';

interface Attestation { pageRevisionId: string; attestRevisionId: string; statusKey: string; expiresAt?: string | null; expiresInDays?: number | null }
export async function verifyReviewRequest(ctx: FeatureContext, id: string, input: ReviewRequestCAS & Attestation) {
 const row = await requestRow(ctx, id);
 return setPageStatus(ctx, row.page_id, { operationKey: input.operationKey, expectedRevisionId: input.pageRevisionId, attestRevisionId: input.attestRevisionId, statusKey: input.statusKey, expiresAt: input.expiresAt, expiresInDays: input.expiresInDays,
 reviewRequest: { id, assignmentGeneration: input.assignmentGeneration, expectedRevisionId: input.expectedRevisionId } });
}
/** Owners still attest individually, with every page's own exact-revision authority. */
export async function bulkVerifyReviews(ctx: FeatureContext, input: { items: (Attestation & { pageId: string; operationKey: string })[] }) {
 if (!input || !Array.isArray(input.items) || !input.items.length || input.items.length > 50) throw new ApiProblem(400, 'INVALID_BULK_REVIEW', 'Choose between one and fifty opened revisions.');
 const results: { pageId: string; verified: boolean; code?: string; message?: string }[] = [];
 for (const item of input.items) {
  try {
   await requirePageLevel(ctx, item.pageId, 'view');
   if (!await bulkReviewOwner(ctx, item.pageId)) throw new ApiProblem(403, 'REVIEW_OWNER_REQUIRED', 'Bulk verification is available to workspace and container owners.');
   await setPageStatus(ctx, item.pageId, { operationKey: item.operationKey, expectedRevisionId: item.pageRevisionId, attestRevisionId: item.attestRevisionId, statusKey: item.statusKey, expiresAt: item.expiresAt, expiresInDays: item.expiresInDays, bulkReview: true });
   results.push({ pageId: item.pageId, verified: true });
  } catch (error) {
   if (!(error instanceof ApiProblem)) throw error;
   results.push({ pageId: item.pageId, verified: false, code: error.code, message: error.message });
  }
 }
 return { items: results };
}
