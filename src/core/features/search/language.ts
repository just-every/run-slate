export type SearchField = 'text' | 'title' | 'label' | 'in' | 'by' | 'owner' | 'status' | 'verified' | 'before' | 'after' | 'type';
export interface SearchClause { field: SearchField; value: string; negated: boolean }
/** OR of groups, each of which is an AND of clauses. */
export interface AdvancedSearch { groups: SearchClause[][] }
export interface AdvancedSearchFields {
  title: string; text: string; labels?: string[]; containers?: string[];
  contributors?: string[]; owners?: string[]; statuses?: string[];
  verification?: 'verified' | 'lapsed' | 'unverified'; updatedAt: string; kind: string;
}
export class SearchLanguageError extends Error {}
const operators = new Set(['title', 'label', 'in', 'by', 'owner', 'status', 'verified', 'before', 'after', 'type']);
export const searchKinds = ['page', 'record', 'container', 'template', 'comment-thread'] as const;
const kindAliases: Record<string, string> = { pages: 'page', records: 'record', containers: 'container', templates: 'template', comment: 'comment-thread', comments: 'comment-thread', 'comment-threads': 'comment-thread' };
export function foldSearch(value: string) { return value.normalize('NFC').toLocaleLowerCase(); }
export function searchKind(value: string) { const folded = foldSearch(value); return kindAliases[folded] ?? folded; }

export function parseAdvancedSearch(query: string): AdvancedSearch {
  const tokens = [...query.matchAll(/(-?)(?:([a-z]+):)?(?:"([^"\n]+)"|(\S+))/gi)].map(match => {
    const named = match[2]?.toLocaleLowerCase(), known = named && operators.has(named);
    // Unknown prefixes retain their literal meaning, including their quotes.
    const value = known ? match[3] ?? match[4]! : named ? match[0].slice(match[1]!.length) : match[3] ?? match[4]!;
    return { field: (known ? named : 'text') as SearchField, value: foldSearch(value), negated: match[1] === '-' && !!value,
      connective: !match[1] && !named && !match[3] && /^(AND|OR)$/.test(match[4] ?? '') ? match[4] : undefined };
  });
  const groups: SearchClause[][] = [[]];
  for (const [index, token] of tokens.entries()) {
    // A connective requires operands on both sides. A literal search for OR/AND
    // (or one at either edge) must remain a literal, never an empty query.
    if (token.connective && index > 0 && index < tokens.length - 1 && !tokens[index - 1]!.connective && !tokens[index + 1]!.connective) {
      if (token.connective === 'OR') groups.push([]);
      continue;
    }
    const clause: SearchClause = { field: token.field, value: token.value, negated: token.negated };
    if (clause.field === 'before' || clause.field === 'after') {
      if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/i.test(clause.value) || !Number.isFinite(Date.parse(clause.value))) throw new SearchLanguageError('Use an ISO date for before: and after:.');
      clause.value = new Date(clause.value).toISOString();
    }
    if (clause.field === 'verified' && !['current', 'verified', 'lapsed', 'unverified', 'true', 'false'].includes(clause.value)) throw new SearchLanguageError('verified: accepts current, verified, lapsed, unverified, true or false.');
    if (clause.field === 'type') {
      clause.value = searchKind(clause.value);
      if (!searchKinds.includes(clause.value as typeof searchKinds[number])) throw new SearchLanguageError('Unknown search type.');
    }
    groups.at(-1)!.push(clause);
  }
  const uniqueGroups = groups.map(group => [...new Map(group.map(clause => [JSON.stringify(clause), clause])).values()]);
  return { groups: [...new Map(uniqueGroups.map(group => [JSON.stringify(group), group])).values()] };
}

export function searchHighlights(search: AdvancedSearch): string[] {
  return [...new Set(search.groups.flat().filter(clause => !clause.negated && ['text', 'title'].includes(clause.field)).map(clause => clause.value))];
}

/** Same language as indexed search, for an independently authorized document. */
export function matchesAdvancedSearch(query: string | AdvancedSearch, fields: AdvancedSearchFields): boolean {
  const parsed = typeof query === 'string' ? parseAdvancedSearch(query) : query;
  const includes = (values: string[] | undefined, value: string) => !!values?.some(item => foldSearch(item) === value);
  return parsed.groups.some(group => group.every(clause => {
    const value = clause.value;
    let matches: boolean;
    switch (clause.field) {
      case 'text': matches = foldSearch(fields.title).includes(value) || foldSearch(fields.text).includes(value); break;
      case 'title': matches = foldSearch(fields.title).includes(value); break;
      case 'label': matches = includes(fields.labels, value); break;
      case 'in': matches = includes(fields.containers, value); break;
      case 'by': matches = includes(fields.contributors, value); break;
      case 'owner': matches = includes(fields.owners, value); break;
      case 'status': matches = includes(fields.statuses, value); break;
      case 'verified': matches = fields.verification !== undefined && (clause.value === 'false' ? fields.verification !== 'verified' : (['true', 'current'].includes(value) ? 'verified' : value) === fields.verification); break;
      case 'before': matches = Date.parse(fields.updatedAt) < Date.parse(value); break;
      case 'after': matches = Date.parse(fields.updatedAt) > Date.parse(value); break;
      case 'type': matches = fields.kind === value; break;
    }
    return clause.negated ? !matches : matches;
  }));
}
