import { ApiProblem } from '../../app/problems';
import { limitValue } from './pagination';
import { parseAdvancedSearch, SearchLanguageError, searchKinds } from './language';
export interface SearchInput {
  query: string; kind?: string; containerId?: string; contributorId?: string; label?: string;
  status?: string; updatedFrom?: string; updatedTo?: string; includeArchived?: boolean;
  includeTrashed?: boolean; sort?: 'relevance' | 'updated' | 'views'; limit?: number; cursor?: string;
}
export function validateSearch(input: SearchInput): SearchInput {
  if (!input || typeof input.query !== 'string' || input.query.length > 1000) throw new ApiProblem(400, 'INVALID_QUERY', 'Query must contain at most 1000 characters.');
  if (input.kind && !searchKinds.includes(input.kind as typeof searchKinds[number])) throw new ApiProblem(400, 'INVALID_KIND', 'Unknown search kind.');
  if (input.sort && !['relevance', 'updated', 'views'].includes(input.sort)) throw new ApiProblem(400, 'INVALID_SORT', 'Choose relevance, updated or views.');
  if (input.label !== undefined && (typeof input.label !== 'string' || input.label.length > 80)) throw new ApiProblem(400, 'INVALID_LABEL', 'Supply a label of at most 80 characters.');
  for (const value of [input.updatedFrom, input.updatedTo]) if (value && !Number.isFinite(Date.parse(value))) throw new ApiProblem(400, 'INVALID_DATE', 'Invalid date filter.');
  try { parseAdvancedSearch(input.query); }
  catch (error) { if (error instanceof SearchLanguageError) throw new ApiProblem(400, 'INVALID_QUERY', error.message); throw error; }
  return { ...input, query: input.query.trim(), ...(input.label !== undefined ? { label: input.label.trim().normalize('NFC') } : {}),
    ...(input.updatedFrom ? { updatedFrom: new Date(input.updatedFrom).toISOString() } : {}),
    ...(input.updatedTo ? { updatedTo: new Date(input.updatedTo).toISOString() } : {}), limit: limitValue(input.limit) };
}
