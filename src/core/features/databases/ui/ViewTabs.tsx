import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "../../../ui";
import { LayoutGlyph, layoutLabel } from "./LayoutGlyph";
import type { DatabaseLock, DatabaseView } from "./types";

/**
 * `DB-003` — the named views over one set of records. A view is saved for everyone
 * who can see the database; renaming, duplicating and deleting need edit access,
 * and a locked structure (`DB-009`) rejects all three while records stay editable.
 */
export function ViewTabs({
  views,
  activeViewId,
  canEdit,
  lock = null,
  onSelectView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
  onAddView,
  className,
}: {
  views: readonly DatabaseView[];
  activeViewId: string;
  canEdit: boolean;
  lock?: DatabaseLock | null;
  onSelectView: (viewId: string) => void;
  onRenameView: (viewId: string) => void;
  onDuplicateView: (viewId: string) => void;
  onDeleteView: (viewId: string) => void;
  onAddView: () => void;
  className?: string;
}) {
  const structureEditable = canEdit && lock === null;
  const activeView = views.find((view) => view.id === activeViewId);

  return (
    <div className={cn("relative flex max-w-full min-w-0 items-center gap-0.5 overflow-x-auto", className)}>
      <div aria-label="Views" className="flex items-center gap-0.5" role="tablist">
        {views.map((view) => {
          const active = view.id === activeViewId;
          return (
            <button
              key={view.id}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onKeyDown={(event) => {
                const index = views.findIndex((candidate) => candidate.id === view.id);
                const next = event.key === "ArrowRight" ? (index + 1) % views.length
                  : event.key === "ArrowLeft" ? (index - 1 + views.length) % views.length
                  : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                onSelectView(views[next].id);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-control px-2 py-1 text-ui font-medium transition-colors",
                active ? "bg-sidebar-hover text-ink" : "text-ink-muted hover:bg-sidebar-hover hover:text-ink",
              )}
              onClick={() => onSelectView(view.id)}
              role="tab"
              type="button"
            >
              <LayoutGlyph className="size-3.5 text-ink-faint" layout={view.layout} />
              {view.name}
              <span className="sr-only"> — {layoutLabel[view.layout]}</span>
            </button>
          );
        })}
      </div>
      {activeView && canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`View options for ${activeView.name}`} size="iconSm" variant="ghost">
              <MoreHorizontal aria-hidden="true" className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={!structureEditable} onSelect={() => onRenameView(activeView.id)}>
              <Pencil aria-hidden="true" className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!structureEditable} onSelect={() => onDuplicateView(activeView.id)}>
              <Copy aria-hidden="true" className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!structureEditable} onSelect={() => onDeleteView(activeView.id)}>
              <Trash2 aria-hidden="true" className="size-3.5" />
              Delete
            </DropdownMenuItem>
            {lock ? (
              <p className="px-2 py-1.5 text-tiny text-ink-muted">
                The structure is locked by {lock.lockedBy}. Records can still be edited.
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {canEdit ? (
        <Button
          aria-label="Add a view"
          className="shrink-0"
          disabled={!structureEditable}
          onClick={onAddView}
          size="iconSm"
          variant="ghost"
        >
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
