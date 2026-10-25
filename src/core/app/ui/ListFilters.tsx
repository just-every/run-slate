import { useId, useRef, type ReactNode } from "react";
import "./list-filters.css";

export interface AppliedFilter { id: string; label: string; remove: () => void }

/** The same folded controls and removable applied filters on every workspace list. */
export function ListFilters({ children, applied = [] }: { children: ReactNode; applied?: AppliedFilter[] }) {
  const id = useId();
  const trigger = useRef<HTMLElement>(null);
  return <div className="list-filters">
    <details onKeyDown={event => {
      if (event.key === "Escape" && event.currentTarget.open) {
        event.preventDefault();
        event.currentTarget.open = false;
        trigger.current?.focus();
      }
    }}>
      <summary ref={trigger} aria-controls={id}>Filters</summary>
      <div id={id} className="list-filter-fields">{children}</div>
    </details>
    {applied.length ? <div className="applied-filters" aria-label="Applied filters">{applied.map(filter => <button type="button" key={filter.id} aria-label={`Remove ${filter.label} filter`} onClick={filter.remove}>{filter.label} <span aria-hidden="true">×</span></button>)}</div> : null}
  </div>;
}
