import type { PageProperties } from '../pages/types';
import { ApiProblem } from '../../app/problems';
import { validDate } from '../work-items/time';

/** Instructions for real page properties, resolved only when a member applies a template. */
export interface TemplateApplicationDefaults {
  owner?: 'applying-member';
  reviewDate?: 'choose-date';
}

export interface TemplateApplicationInput {
  reviewDate?: string;
}

export function templateApplicationProperties(
  properties: Partial<PageProperties>,
  defaults: TemplateApplicationDefaults | undefined,
  input: TemplateApplicationInput,
  memberId: string,
): Partial<PageProperties> & { reviewDate?: string | null } {
  if (input.reviewDate !== undefined && !validDate(input.reviewDate))
    throw new ApiProblem(400, 'INVALID_REVIEW_DATE', 'Choose a valid review date.');
  if (defaults?.reviewDate === 'choose-date' && !input.reviewDate)
    throw new ApiProblem(400, 'REVIEW_DATE_REQUIRED', 'Choose a review date for this page.');
  return {
    ...properties,
    ...(defaults?.owner === 'applying-member' ? { ownerMemberId: memberId } : {}),
    ...(input.reviewDate !== undefined ? { reviewDate: input.reviewDate } : {}),
  };
}
