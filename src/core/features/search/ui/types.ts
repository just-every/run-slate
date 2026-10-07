/**
 * Shared prop types for the search surfaces (`SEARCH-001` … `SEARCH-009`,
 * `AI-004`, `AI-015`). Everything here is data the caller supplies; no surface
 * in this feature fetches, formats a date, or invents a value that is missing.
 */

/** What a result is. Labels come from the vocabulary module, never from this key. */
export type SearchResultKind = "page" | "record" | "container" | "comment" | "template";

/** How a result stands relative to the default visibility rule (`SEARCH-009`). */
export type SearchLifecycle = "live" | "archived" | "trashed";

/** One run of result text, marked where the query matched (`SEARCH-002`). */
export interface MatchSegment {
  text: string;
  matched: boolean;
}

/** A person, exactly as much as a result row needs. */
export interface SearchPerson {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** One ranked result (`SEARCH-002`). */
export interface SearchResultItem {
  id: string;
  kind: SearchResultKind;
  /** Title runs, so the match shows in the title too when it landed there. */
  titleSegments: readonly MatchSegment[];
  /** The matched text in its surrounding context. Empty when the match was the title alone. */
  contextSegments: readonly MatchSegment[];
  /** The container this lives in; `null` for a container result itself. */
  containerName: string | null;
  contributor: SearchPerson | null;
  /** A written-out time such as "Updated 14 March 2026". The caller formats it. */
  updatedLabel: string | null;
  lifecycle: SearchLifecycle;
  /** A workspace status value, when the record carries one. */
  statusLabel?: string | null;
}

/** Results grouped by a caller-supplied period label such as "Today". */
export interface SearchResultGroup {
  id: string;
  label: string;
  results: readonly SearchResultItem[];
}

/** A selectable value in a filter menu. */
export interface SearchOption {
  id: string;
  label: string;
}

/** The window a result was last updated in (`SEARCH-003`). */
export interface SearchUpdatedWindow {
  id: string;
  label: string;
}

/** Every filter in force. Changing any of these never changes the query text. */
export interface SearchFilterState {
  kinds: readonly SearchResultKind[];
  containerIds: readonly string[];
  contributorIds: readonly string[];
  statusIds: readonly string[];
  updatedWindowId: string | null;
  includeArchived: boolean;
  includeTrashed: boolean;
  /** Narrow matching to titles alone; body text stays searchable when off. */
  titleOnly: boolean;
}

/** What the member may choose between. The caller owns this catalogue. */
export interface SearchFilterOptions {
  kinds: readonly SearchResultKind[];
  containers: readonly SearchOption[];
  contributors: readonly SearchOption[];
  statuses: readonly SearchOption[];
  updatedWindows: readonly SearchUpdatedWindow[];
}

/** One filter in force, ready to show beside the results (`SEARCH-003`). */
export interface AppliedFilter {
  /** Stable within one result set; used as the React key and passed back on removal. */
  id: string;
  /** The filter family, e.g. the word "Kind". */
  group: string;
  /** The chosen value, already resolved to its label. */
  value: string;
}

/** One container the search is scoped to (`SEARCH-006`). */
export interface SearchScope {
  containerId: string;
  containerName: string;
}

/** A facet value with its count, for the results page's right-hand column. */
export interface SearchFacetValue {
  id: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface SearchFacetGroup {
  id: string;
  label: string;
  values: readonly SearchFacetValue[];
}

/**
 * One statement in a generated answer. `sourced` false means the product cannot
 * cite it, and it is labelled as unsourced rather than presented as drawn from
 * the workspace (`AI-004`).
 */
export interface GeneratedAnswerStatement {
  id: string;
  text: string;
  sourced: boolean;
}

/** A citation names a page and the revision the answer drew on (`AI-004`). */
export interface GeneratedAnswerCitation {
  id: string;
  pageTitle: string;
  revisionLabel: string;
}

/**
 * The generated answer above the results (`AI-015`). `absent` renders nothing at
 * all — with the provider unconfigured, disabled, failing or over budget the
 * answer is absent rather than empty (`SEARCH-008`).
 */
export type GeneratedAnswerState =
  | { kind: "absent" }
  | { kind: "loading" }
  | { kind: "not-found" }
  | {
      kind: "present";
      statements: readonly GeneratedAnswerStatement[];
      citations: readonly GeneratedAnswerCitation[];
    };
