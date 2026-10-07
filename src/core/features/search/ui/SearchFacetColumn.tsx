import { useId } from "react";
import { Checkbox, Label, cn } from "../../../ui";
import type { SearchFacetGroup } from "./types";

/**
 * `SEARCH-003` — the same narrowing as the filter bar, offered as counted facets
 * beside the results. A count is a number the caller measured; nothing here
 * derives or guesses one.
 */
export function SearchFacetColumn({
  facets,
  onToggleFacet,
  className,
}: {
  facets: readonly SearchFacetGroup[];
  onToggleFacet: (groupId: string, valueId: string, selected: boolean) => void;
  className?: string;
}) {
  if (facets.length === 0) return null;
  return (
    <nav aria-label="Narrow these results" className={cn("flex flex-col gap-5", className)}>
      {facets.map((group) => (
        <section key={group.id}>
          <h3 className="mb-1.5 text-micro font-medium tracking-wide text-ink-faint uppercase">{group.label}</h3>
          <ul className="flex flex-col">
            {group.values.map((value) => (
              <FacetRow
                groupId={group.id}
                key={value.id}
                onToggleFacet={onToggleFacet}
                value={value}
              />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function FacetRow({
  groupId,
  value,
  onToggleFacet,
}: {
  groupId: string;
  value: SearchFacetGroup["values"][number];
  onToggleFacet: (groupId: string, valueId: string, selected: boolean) => void;
}) {
  const id = useId();
  return (
    <li className="flex items-center gap-2 rounded-control px-1.5 py-1 hover:bg-sidebar-hover">
      <Checkbox
        checked={value.selected}
        id={id}
        onCheckedChange={(checked) => onToggleFacet(groupId, value.id, checked === true)}
      />
      <Label className="min-w-0 flex-1 truncate text-ui font-normal text-ink" htmlFor={id}>
        {value.label}
      </Label>
      <span className="shrink-0 text-tiny text-ink-faint">{value.count}</span>
    </li>
  );
}
