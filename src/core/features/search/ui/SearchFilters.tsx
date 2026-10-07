import { CalendarDays, CaseSensitive, EyeOff, Folder, Shapes, Tag, User } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Toggle,
  cn,
} from "../../../ui";
import { filterGroupLabels } from "./describe";
import { MultiFilterMenu, SingleFilterMenu, type FilterDensity } from "./FilterMenu";
import { searchKindLabel } from "./kinds";
import type { SearchFilterOptions, SearchFilterState } from "./types";

/**
 * `SEARCH-003` — results are narrowed by kind, container, contributor, status,
 * updated date, and whether archived or trashed records are included. Nothing
 * here touches the query text; the caller's query state is not even passed in.
 *
 * Two densities: a chip row inside the dialog, a wider bar on the results page.
 */
export function SearchFilters({
  filters,
  options,
  onChange,
  density = "bar",
  className,
}: {
  filters: SearchFilterState;
  options: SearchFilterOptions;
  onChange: (next: SearchFilterState) => void;
  density?: FilterDensity;
  className?: string;
}) {
  const iconClass = "size-3.5 text-ink-faint";
  const kindChoices = options.kinds.map((kind) => ({ id: kind, label: searchKindLabel(kind) }));

  return (
    <div
      aria-label="Search filters"
      className={cn("flex flex-wrap items-center gap-1.5", density === "bar" ? "gap-2" : "", className)}
      role="group"
    >
      <Toggle
        className={cn(
          "border border-line-strong bg-surface",
          density === "chips" ? "h-7 rounded-full text-tiny" : "h-8 rounded-control",
        )}
        onPressedChange={(pressed) => onChange({ ...filters, titleOnly: pressed })}
        pressed={filters.titleOnly}
      >
        <CaseSensitive aria-hidden="true" className={iconClass} />
        Titles only
      </Toggle>

      <MultiFilterMenu
        density={density}
        heading={filterGroupLabels.kind}
        icon={<Shapes aria-hidden="true" className={iconClass} />}
        label={filterGroupLabels.kind}
        onChange={(next) => onChange({ ...filters, kinds: next as SearchFilterState["kinds"] })}
        options={kindChoices}
        selectedIds={filters.kinds}
      />

      <MultiFilterMenu
        density={density}
        heading={filterGroupLabels.container}
        icon={<Folder aria-hidden="true" className={iconClass} />}
        label={filterGroupLabels.container}
        onChange={(next) => onChange({ ...filters, containerIds: next })}
        options={options.containers}
        selectedIds={filters.containerIds}
      />

      <MultiFilterMenu
        density={density}
        heading={filterGroupLabels.contributor}
        icon={<User aria-hidden="true" className={iconClass} />}
        label={filterGroupLabels.contributor}
        onChange={(next) => onChange({ ...filters, contributorIds: next })}
        options={options.contributors}
        selectedIds={filters.contributorIds}
      />

      <MultiFilterMenu
        density={density}
        heading={filterGroupLabels.status}
        icon={<Tag aria-hidden="true" className={iconClass} />}
        label={filterGroupLabels.status}
        onChange={(next) => onChange({ ...filters, statusIds: next })}
        options={options.statuses}
        selectedIds={filters.statusIds}
      />

      <SingleFilterMenu
        clearLabel="Any time"
        density={density}
        heading={filterGroupLabels.updated}
        icon={<CalendarDays aria-hidden="true" className={iconClass} />}
        label={filterGroupLabels.updated}
        onChange={(next) => onChange({ ...filters, updatedWindowId: next })}
        options={options.updatedWindows}
        selectedId={filters.updatedWindowId}
      />

      <VisibilityFilterMenu density={density} filters={filters} onChange={onChange} />
    </div>
  );
}

/**
 * `SEARCH-009` — archived and trashed records are excluded by default, and this
 * is the control that undoes that. It is a default, not a rule about access.
 */
function VisibilityFilterMenu({
  filters,
  onChange,
  density,
}: {
  filters: SearchFilterState;
  onChange: (next: SearchFilterState) => void;
  density: FilterDensity;
}) {
  const chosen = [filters.includeArchived ? "Archived" : null, filters.includeTrashed ? "In trash" : null].filter(
    (value): value is string => Boolean(value),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn("gap-1.5 font-normal", density === "chips" ? "rounded-full" : "")}
          size={density === "chips" ? "sm" : "md"}
          variant="secondary"
        >
          <EyeOff aria-hidden="true" className="size-3.5 text-ink-faint" />
          <span className="text-ink-muted">{filterGroupLabels.visibility}</span>
          {chosen.length > 0 ? <span className="font-medium text-ink">{chosen.join(", ")}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{filterGroupLabels.visibility}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={filters.includeArchived}
          onCheckedChange={(checked) => onChange({ ...filters, includeArchived: checked === true })}
          onSelect={(event) => event.preventDefault()}
        >
          Archived
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={filters.includeTrashed}
          onCheckedChange={(checked) => onChange({ ...filters, includeTrashed: checked === true })}
          onSelect={(event) => event.preventDefault()}
        >
          In trash
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
