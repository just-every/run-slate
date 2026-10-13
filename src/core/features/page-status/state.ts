import { ApiProblem } from '../../app/problems';

/**
 * STAT-003/STAT-004: one definition of what a page's verification says, shared by
 * the page, the review list, content queries, published queries, exports and the
 * lapse notice. Only the page's latest verification counts, and only while the page
 * still carries the status it attested. `current` needs both an unexpired attestation
 * and the attested revision still being the working one; anything else never reads as
 * current.
 */
export type VerificationState = 'current' | 'changed' | 'lapsed';

/** The review list shows verifications that lapse within this many days. */
export const expiringWithinDays = 14;
export const expiryPresets = [7, 30, 90] as const;
const day = 86_400_000;

/** The id of `page`'s latest verification row; `page` is a pages alias. */
export const latestVerificationSql = (page: string) => `(SELECT lv.id FROM page_verifications lv WHERE lv.page_id=${page}.id ORDER BY lv.created_at DESC,lv.id DESC LIMIT 1)`;

/** NULL when the verification no longer applies to the page's status; otherwise the state. */
export function verificationStateSql(page: string, verification: string, now: string) {
  return `CASE WHEN ${verification}.id IS NULL OR ${page}.status_key IS NOT ${verification}.status_key THEN NULL WHEN ${verification}.expires_at<=${now} THEN 'lapsed' WHEN ${verification}.revision_id<>${page}.working_revision_id THEN 'changed' ELSE 'current' END`;
}

/** A status as readers should see it: an attested status that is not current reads as `lapsed`, as search does. */
export function effectiveStatusSql(page: string, now: string) {
  return `CASE WHEN EXISTS(SELECT 1 FROM page_verifications ev WHERE ev.id=${latestVerificationSql(page)} AND ev.status_key IS ${page}.status_key AND (ev.expires_at<=${now} OR ev.revision_id<>${page}.working_revision_id)) THEN 'lapsed' ELSE ${page}.status_key END`;
}

export function verificationState(v: { status_key: string; revision_id: string; expires_at: string | null }, page: { status_key: string | null; working_revision_id: string }, now: string): VerificationState | null {
  if (page.status_key !== v.status_key) return null;
  if (v.expires_at && v.expires_at <= now) return 'lapsed';
  return v.revision_id === page.working_revision_id ? 'current' : 'changed';
}

/** The expiry the server stores: a preset counted from its own clock, a future date, or none. */
export function verificationExpiry(input: { expiresInDays?: unknown; expiresAt?: unknown }, now: string): string | null {
  if (input.expiresInDays !== undefined && input.expiresInDays !== null) {
    if (input.expiresAt) throw new ApiProblem(400, 'INVALID_EXPIRY', 'Choose a number of days or a date, not both.');
    if (!expiryPresets.includes(input.expiresInDays as 7)) throw new ApiProblem(400, 'INVALID_EXPIRY', 'Choose 7, 30 or 90 days, a date, or no expiry.');
    return new Date(Date.parse(now) + (input.expiresInDays as number) * day).toISOString();
  }
  if (input.expiresAt === undefined || input.expiresAt === null || input.expiresAt === '') return null;
  const at = typeof input.expiresAt === 'string' ? Date.parse(input.expiresAt) : NaN;
  if (!Number.isFinite(at) || at <= Date.parse(now)) throw new ApiProblem(400, 'INVALID_EXPIRY', 'Choose an expiry date in the future.');
  return new Date(at).toISOString();
}

export function expiringBefore(now: string) { return new Date(Date.parse(now) + expiringWithinDays * day).toISOString(); }
