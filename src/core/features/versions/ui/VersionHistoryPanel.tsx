import { X } from "lucide-react";
import {
  Button,
  Checkbox,
  cn,
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  ScrollArea,
  type SurfaceState,
} from "../../../ui";
import type { VersionEntry, VersionProfile } from "./types";
import { compareLimitNotice, VersionHistoryTable, type VersionHistoryViewProps } from "./VersionHistoryTable";
import { VersionTombstoneRow } from "./VersionTombstoneRow";

export interface VersionHistoryPanelProps extends VersionHistoryViewProps {
  versionProfile: VersionProfile;
  state: SurfaceState;
  errorDetail?: string;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  onClose?: () => void;
}

/**
 * `REV-002` and `REV-007`. Under `autosnapshot` a right-hand panel, newest first, each
 * entry the time over the actor, with no ordinal, no label, no version or comment column
 * and no delete action; selection, compare, restore and difference summaries stay. Under
 * `labelled` the full table, which hides nothing.
 */
export function VersionHistoryPanel(props: VersionHistoryPanelProps) {
  const { versionProfile, state } = props;
  const labelled = versionProfile === "labelled";

  const body =
    state === "loading" ? (
      <LoadingState rows={6} />
    ) : state === "denied" ? (
      <DeniedState onRequestAccess={props.onRequestAccess} title="You need access to read this history" />
    ) : state === "error" ? (
      <ErrorState
        className="m-3"
        detail={props.errorDetail}
        onRetry={props.onRetry}
        title="This history could not be loaded"
      />
    ) : state === "empty" ? (
      <EmptyState
        description="Revisions appear here as this page is edited."
        title="No earlier revisions yet"
      />
    ) : labelled ? (
      <div className="p-3">
        <VersionHistoryTable {...props} />
      </div>
    ) : (
      <AutosnapshotList {...props} />
    );

  if (labelled) {
    return (
      <section aria-labelledby="version-history-heading" className="flex w-full flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="text-h3 font-semibold text-ink" id="version-history-heading">
            Version history
          </h2>
          {props.onClose ? (
            <Button aria-label="Close version history" onClick={props.onClose} size="iconSm" variant="ghost">
              <X aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </header>
        {body}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="version-history-heading"
      className="flex h-full w-full flex-col border-l border-line bg-surface sm:w-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-ui font-semibold text-ink" id="version-history-heading">
          Version history
        </h2>
        {props.onClose ? (
          <Button aria-label="Close version history" onClick={props.onClose} size="iconSm" variant="ghost">
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1">{body}</div>
      {state === "ready" ? <AutosnapshotFooter {...props} /> : null}
    </section>
  );
}

function AutosnapshotList(props: VersionHistoryPanelProps) {
  return (
    <ScrollArea className="h-full">
      <ul className="flex flex-col p-1">
        {props.entries.map((entry) =>
          entry.tombstone ? (
            <VersionTombstoneRow
              key={entry.id}
              ordinal={entry.ordinal ?? 0}
              tombstone={entry.tombstone}
              variant="panel"
            />
          ) : (
            <AutosnapshotRow
              activeId={props.activeId}
              entry={entry}
              key={entry.id}
              onOpen={props.onOpen}
              onToggleSelect={props.onToggleSelect}
              selected={props.selectedIds.includes(entry.id)}
            />
          ),
        )}
      </ul>
    </ScrollArea>
  );
}

function AutosnapshotRow({
  entry,
  activeId,
  selected,
  onOpen,
  onToggleSelect,
}: {
  entry: VersionEntry;
  activeId: string | null;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string, selected: boolean) => void;
}) {
  const active = entry.id === activeId;
  return (
    <li className={cn("flex items-center gap-2 rounded-control px-2", active && "bg-sidebar-hover")}>
      <Checkbox
        aria-label={`Select the revision from ${entry.at} for comparison`}
        checked={selected}
        onCheckedChange={(next) => onToggleSelect(entry.id, next === true)}
      />
      <button
        className="flex-1 rounded-control py-1.5 text-left hover:bg-sidebar-hover"
        onClick={() => onOpen(entry.id)}
        type="button"
      >
        <span className={cn("block text-ui", active ? "font-medium text-ink" : "text-ink")}>{entry.at}</span>
        <span className="block text-tiny text-ink-muted">{entry.actorName}</span>
      </button>
    </li>
  );
}

function AutosnapshotFooter(props: VersionHistoryPanelProps) {
  const canCompare = props.selectedIds.length === 2;
  return (
    <footer className="flex flex-col gap-2 border-t border-line px-3 py-2.5">
      <p className="text-tiny text-ink-faint">{compareLimitNotice}</p>
      {props.differenceSummary ? (
        <p className="text-tiny text-ink-muted">{props.differenceSummary}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button disabled={!canCompare} onClick={props.onCompare} size="sm" variant="ghost">
            Compare
          </Button>
          {props.onSummariseDifferences ? (
            <Button disabled={!canCompare} onClick={props.onSummariseDifferences} size="sm" variant="ghost">
              Summarise differences
            </Button>
          ) : null}
        </div>
        <Button
          disabled={props.activeId === null}
          onClick={() => props.activeId && props.onRestore(props.activeId)}
          size="sm"
        >
          Restore
        </Button>
      </div>
    </footer>
  );
}
