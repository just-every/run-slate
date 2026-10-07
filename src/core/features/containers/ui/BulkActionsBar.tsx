import { Archive, FolderInput, Tag, Trash2, UserCog, X } from "lucide-react";
import { Button, cn } from "../../../ui";
import { memberNoun } from "./nouns";
import type { BulkActionOutcome } from "./types";

export interface BulkActionsBarProps {
  selectedCount: number;
  /** CONT-006 — the result of the last run, naming what failed and what was applied. */
  outcome: BulkActionOutcome | null;
  busyAction?: string | null;
  onArchive: () => void;
  onTrash: () => void;
  onMove: () => void;
  onChangeOwner: () => void;
  onChangeStatus: () => void;
  onClearSelection: () => void;
  onDismissOutcome: () => void;
  className?: string;
}

/** CONT-006 — select several pages and act on all of them in one action. */
export function BulkActionsBar({
  selectedCount,
  outcome,
  busyAction = null,
  onArchive,
  onTrash,
  onMove,
  onChangeOwner,
  onChangeStatus,
  onClearSelection,
  onDismissOutcome,
  className,
}: BulkActionsBarProps) {
  const actions = [
    { key: "archive", label: "Archive", icon: Archive, run: onArchive },
    { key: "trash", label: "Trash", icon: Trash2, run: onTrash },
    { key: "move", label: "Move", icon: FolderInput, run: onMove },
    { key: "owner", label: "Change owner", icon: UserCog, run: onChangeOwner },
    { key: "status", label: "Change status", icon: Tag, run: onChangeStatus },
  ] as const;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {outcome ? (
        <div
          className={cn(
            "rounded-card border px-3 py-2",
            outcome.failures.length ? "border-warn/30 bg-warn-soft" : "border-good/30 bg-good-soft",
          )}
          role="status"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-ui font-medium text-ink">
                {outcome.actionLabel} applied to {outcome.appliedCount}{" "}
                {outcome.appliedCount === 1 ? "page" : "pages"}
                {outcome.failures.length
                  ? `, and ${outcome.failures.length} ${outcome.failures.length === 1 ? "page was" : "pages were"} left unchanged.`
                  : "."}
              </p>
              {outcome.failures.length ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {outcome.failures.map((failure) => (
                    <li className="text-tiny text-ink-muted" key={failure.pageId}>
                      <span className="text-ink">{failure.title}</span> — {failure.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Button aria-label="Dismiss this result" onClick={onDismissOutcome} size="iconSm" variant="ghost">
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <div
          aria-label={`${selectedCount} selected`}
          className="flex flex-wrap items-center gap-1.5 rounded-card border border-line-strong bg-surface px-2.5 py-1.5 shadow-sm"
          role="toolbar"
        >
          <span className="text-ui text-ink">
            {selectedCount} {selectedCount === 1 ? "page" : "pages"} selected
          </span>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
          {actions.map((action) => (
            <Button
              disabled={busyAction !== null}
              key={action.key}
              onClick={action.run}
              size="sm"
              variant="ghost"
            >
              <action.icon aria-hidden="true" className="size-3.5" />
              {busyAction === action.key ? `${action.label}…` : action.label}
            </Button>
          ))}
          <Button className="ml-auto" onClick={onClearSelection} size="sm" variant="ghost">
            Clear selection
          </Button>
        </div>
      ) : null}

      <p className="text-tiny text-ink-faint">
        Each selected page is checked against your own access and records its own activity entry, so a {memberNoun}
        &rsquo;s missing access stops that page only.
      </p>
    </div>
  );
}
