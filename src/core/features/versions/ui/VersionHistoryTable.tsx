import {
  Badge,
  Button,
  Checkbox,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../ui";
import type { VersionEntry } from "./types";
import { VersionTombstoneRow } from "./VersionTombstoneRow";

/** `REV-004` — the rule stated wherever a comparison is selected. */
export const compareLimitNotice = "Only two versions can be compared at a time.";

export interface VersionHistoryViewProps {
  entries: readonly VersionEntry[];
  /** The revision currently being read behind the history. */
  activeId: string | null;
  onOpen: (id: string) => void;
  selectedIds: readonly string[];
  onToggleSelect: (id: string, selected: boolean) => void;
  onCompare: () => void;
  onSummariseDifferences?: () => void;
  /** The last difference summary, written out; null when none has been asked for. */
  differenceSummary?: string | null;
  onRestore: (id: string) => void;
  /** Offered only under `labelled` (`REV-006`). */
  onDelete?: (id: string) => void;
}

function deleteBlockReason(entry: VersionEntry): string | null {
  if (entry.isCurrent) return "The current revision cannot be deleted.";
  if (entry.isPublished) return "The published revision cannot be deleted.";
  return null;
}

/** The `labelled` face of `REV-002`: ordinal, date, actor, the status at that moment,
 * the version comment, and Restore and Delete on each row. */
export function VersionHistoryTable(props: VersionHistoryViewProps) {
  const canCompare = props.selectedIds.length === 2;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!canCompare} onClick={props.onCompare} size="sm" variant="secondary">
          Compare selected versions
        </Button>
        {props.onSummariseDifferences ? (
          <Button disabled={!canCompare} onClick={props.onSummariseDifferences} size="sm" variant="ghost">
            Summarise differences
          </Button>
        ) : null}
        <p className="text-tiny text-ink-faint">{compareLimitNotice}</p>
      </div>

      {props.differenceSummary ? (
        <p className="rounded-card border border-line bg-canvas px-3 py-2 text-ui text-ink-muted">
          {props.differenceSummary}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Select</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Changed by</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Comment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.entries.map((entry) =>
              entry.tombstone ? (
                <VersionTombstoneRow
                  key={entry.id}
                  ordinal={entry.ordinal ?? 0}
                  tombstone={entry.tombstone}
                  variant="table"
                />
              ) : (
                <TableRow className={cn(entry.id === props.activeId && "bg-sidebar-hover")} key={entry.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select version ${entry.ordinal ?? entry.at} for comparison`}
                      checked={props.selectedIds.includes(entry.id)}
                      onCheckedChange={(next) => props.onToggleSelect(entry.id, next === true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button className="h-auto p-0" onClick={() => props.onOpen(entry.id)} variant="link">
                      {entry.isCurrent ? `Current (v. ${entry.ordinal ?? "—"})` : `v. ${entry.ordinal ?? "—"}`}
                    </Button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ink-muted">{entry.at}</TableCell>
                  <TableCell className="whitespace-nowrap text-ink-muted">{entry.actorName}</TableCell>
                  <TableCell>
                    {entry.statusLabel ? <Badge tone="neutral">{entry.statusLabel}</Badge> : null}
                  </TableCell>
                  <TableCell className="text-ink-muted">{entry.comment ?? ""}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button onClick={() => props.onRestore(entry.id)} size="sm" variant="ghost">
                      Restore
                    </Button>
                    {props.onDelete ? (
                      <Button
                        disabled={deleteBlockReason(entry) !== null}
                        onClick={() => props.onDelete?.(entry.id)}
                        size="sm"
                        title={deleteBlockReason(entry) ?? undefined}
                        variant="ghost"
                      >
                        Delete
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-tiny text-ink-faint">
        The current revision and the published revision cannot be deleted. Deleting an intermediate version
        leaves a numbered tombstone naming who deleted it and when.
      </p>
    </div>
  );
}
