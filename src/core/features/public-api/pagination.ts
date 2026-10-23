import { ApiProblem } from '../../app/problems';
import { requestHash } from '../../app/request-hash';
import limits from '../../../../seed.json';

export async function paginate<T>(items: T[], query: Record<string, string>, binding: unknown) {
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > limits.limits.publicApiPageSize) throw new ApiProblem(400, 'INVALID_PAGE_SIZE', 'Choose a page size within the documented limit.');
  const hash = await requestHash(binding);
  let offset = 0;
  if (query.cursor) {
    try {
      const cursor = JSON.parse(atob(query.cursor));
      if (cursor.query !== hash || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw new Error('cursor');
      offset = cursor.offset;
    } catch { throw new ApiProblem(400, 'INVALID_CURSOR', 'Use the cursor returned by this operation.'); }
  }
  const selected = items.slice(offset, offset + limit), next = offset + selected.length;
  return { items: selected, nextCursor: next < items.length ? btoa(JSON.stringify({ query: hash, offset: next })) : null };
}
