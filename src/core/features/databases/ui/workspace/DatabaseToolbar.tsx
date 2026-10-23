import { Search } from "lucide-react";
import type { ReactNode } from "react";
import type { ViewDto } from "../../../../client/records";

/** What the database screen shows: the records of the current view, that view's chart, the database's record templates, or its automations. */
export type DatabaseMode = "records" | "chart" | "templates" | "automations" | "forms";

/**
 * The one toolbar above the records. Left: one view switcher of compact toggle buttons (the saved views, Chart, Templates, Automations), of
 * which exactly one is pressed at a time. Right: a compact "Find in this view" field, the two option menus and the one primary
 * action, New record.
 */
export function DatabaseToolbar({
  views,
  activeViewId,
  onSelectView,
  mode,
  onMode,
  search,
  onSearch,
  children,
}: {
  views: ViewDto[];
  activeViewId?: string;
  onSelectView: (id: string) => void;
  mode: DatabaseMode;
  /** Chart, Templates and Automations toggle: pressing the one already shown returns to the records. */
  onMode: (mode: DatabaseMode) => void;
  search: string;
  onSearch: (value: string) => void;
  /** The menus and the primary action. */
  children: ReactNode;
}) {
  return (
    <div className="db-toolbar">
      <nav className="tabs db-tabs" aria-label="Saved views">
        {views.map((item) => (
          <button key={item.id} type="button" aria-pressed={mode === "records" && activeViewId === item.id} onClick={() => onSelectView(item.id)}>
            {item.name}
          </button>
        ))}
        <span className="tabs-divider" aria-hidden="true" />
        <button type="button" aria-pressed={mode === "chart"} onClick={() => onMode(mode === "chart" ? "records" : "chart")}>
          Chart
        </button>
        <button type="button" aria-pressed={mode === "templates"} onClick={() => onMode(mode === "templates" ? "records" : "templates")}>
          Templates
        </button>
        <button type="button" aria-pressed={mode === "forms"} onClick={() => onMode(mode === "forms" ? "records" : "forms")}>Forms</button>
        <button type="button" aria-pressed={mode === "automations"} onClick={() => onMode(mode === "automations" ? "records" : "automations")}>
          Automations
        </button>
      </nav>
      <div className="db-actions">
        <label className="db-find">
          <Search aria-hidden="true" />
          <span className="sr-only">Find in this view</span>
          <input type="search" value={search} placeholder="Find in this view" onChange={(event) => onSearch(event.target.value)} />
        </label>
        {children}
      </div>
    </div>
  );
}
