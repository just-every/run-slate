import { searchKindLabel } from "./kinds";
import { containerNoun, memberNoun, sentenceCase } from "./nouns";
import type { AppliedFilter, SearchFilterOptions, SearchFilterState, SearchResultKind } from "./types";

/** The word for each filter family, once, so every surface names them the same. */
export const filterGroupLabels = {
  kind: "Kind",
  container: sentenceCase(containerNoun),
  contributor: sentenceCase(memberNoun),
  status: "Status",
  updated: "Updated",
  visibility: "Also included",
  match: "Match",
} as const;

function labelFor(options: readonly { id: string; label: string }[], id: string): string | null {
  return options.find((option) => option.id === id)?.label ?? null;
}

/**
 * `SEARCH-003` — the filters in force, resolved to words. Used beside the
 * results and again in the no-results state (`SEARCH-007`). A chosen value the
 * option catalogue does not contain is dropped rather than guessed at.
 */
export function describeFilters(
  filters: SearchFilterState,
  options: SearchFilterOptions,
): readonly AppliedFilter[] {
  const applied: AppliedFilter[] = [];

  for (const kind of filters.kinds) {
    applied.push({ id: `kind:${kind}`, group: filterGroupLabels.kind, value: searchKindLabel(kind) });
  }
  for (const id of filters.containerIds) {
    const label = labelFor(options.containers, id);
    if (label) applied.push({ id: `container:${id}`, group: filterGroupLabels.container, value: label });
  }
  for (const id of filters.contributorIds) {
    const label = labelFor(options.contributors, id);
    if (label) applied.push({ id: `contributor:${id}`, group: filterGroupLabels.contributor, value: label });
  }
  for (const id of filters.statusIds) {
    const label = labelFor(options.statuses, id);
    if (label) applied.push({ id: `status:${id}`, group: filterGroupLabels.status, value: label });
  }
  if (filters.updatedWindowId) {
    const label = labelFor(options.updatedWindows, filters.updatedWindowId);
    if (label) applied.push({ id: "updated", group: filterGroupLabels.updated, value: label });
  }
  if (filters.includeArchived) {
    applied.push({ id: "archived", group: filterGroupLabels.visibility, value: "Archived" });
  }
  if (filters.includeTrashed) {
    applied.push({ id: "trashed", group: filterGroupLabels.visibility, value: "In trash" });
  }
  if (filters.titleOnly) {
    applied.push({ id: "title-only", group: filterGroupLabels.match, value: "Titles only" });
  }
  return applied;
}

/** Every filter cleared. The query text is untouched — it is not a filter. */
export const clearedFilters: SearchFilterState = {
  kinds: [],
  containerIds: [],
  contributorIds: [],
  statusIds: [],
  updatedWindowId: null,
  includeArchived: false,
  includeTrashed: false,
  titleOnly: false,
};

/** Drop one filter named by the id `describeFilters` gave it. */
export function removeFilter(filters: SearchFilterState, appliedId: string): SearchFilterState {
  const [family, value] = appliedId.split(":");
  if (family === "kind" && value) {
    return { ...filters, kinds: filters.kinds.filter((kind) => kind !== (value as SearchResultKind)) };
  }
  if (family === "container" && value) {
    return { ...filters, containerIds: filters.containerIds.filter((id) => id !== value) };
  }
  if (family === "contributor" && value) {
    return { ...filters, contributorIds: filters.contributorIds.filter((id) => id !== value) };
  }
  if (family === "status" && value) {
    return { ...filters, statusIds: filters.statusIds.filter((id) => id !== value) };
  }
  if (appliedId === "updated") return { ...filters, updatedWindowId: null };
  if (appliedId === "archived") return { ...filters, includeArchived: false };
  if (appliedId === "trashed") return { ...filters, includeTrashed: false };
  if (appliedId === "title-only") return { ...filters, titleOnly: false };
  return filters;
}
