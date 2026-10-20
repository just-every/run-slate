import type { RuleReason } from '../definitions';
import { displayDate } from '../../../../app/ui/displayDate';

/** Why a rule changed a page, in words; page IDs and dates only, never page text. */
export function reasonText(reason: RuleReason): string {
  if (reason.rule === 'cited-changed') return `${reason.citedPageIds.length === 1 ? 'A page it cites' : `${reason.citedPageIds.length} pages it cites`} changed after the verification.`;
  if (reason.rule === 'no-owner') return reason.owner === 'unset' ? 'The page has no owner.' : 'Its owner is no longer an active member.';
  return reason.lastViewedAt ? `Not viewed in ${reason.days} days (last view ${displayDate(reason.lastViewedAt, false)}).` : `Not viewed in ${reason.days} days.`;
}
