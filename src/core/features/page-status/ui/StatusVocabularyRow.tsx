import { Button, cn, Input, Switch, TableCell, TableRow } from "../../../ui";
import { statusColourClass } from "./status-colours";
import { StatusColourPicker } from "./StatusColourPicker";
import type { StatusColourKey, StatusEntry } from "./types";

export interface StatusVocabularyRowProps {
  entry: StatusEntry;
  editing: boolean;
  /** The label being typed while this row is in rename. */
  draftLabel: string;
  onDraftLabelChange: (value: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onColourChange: (colour: StatusColourKey) => void;
  onVerificationChange: (requiresVerification: boolean) => void;
  onRetire: () => void;
  /** The bulk change `STAT-001` offers for the pages still carrying a retired entry. */
  onBulkChange: () => void;
}

/** One row of the workspace status vocabulary (`STAT-001`). */
export function StatusVocabularyRow(props: StatusVocabularyRowProps) {
  const { entry } = props;
  return (
    <TableRow className={cn(entry.retired && "text-ink-muted")}>
      <TableCell className="whitespace-nowrap">
        <code className="text-tiny text-ink-muted">{entry.key}</code>
      </TableCell>
      <TableCell>
        {props.editing ? (
          <div className="flex items-center gap-1">
            <Input
              aria-label={`Rename ${entry.label}`}
              className="max-w-48"
              onChange={(event) => props.onDraftLabelChange(event.target.value)}
              value={props.draftLabel}
            />
            <Button onClick={props.onCommitRename} size="sm">
              Save
            </Button>
            <Button onClick={props.onCancelRename} size="sm" variant="ghost">
              Cancel
            </Button>
          </div>
        ) : (
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-2.5 rounded-full", statusColourClass[entry.colour])} />
            <span className="text-ui text-ink">{entry.label}</span>
            {entry.retired ? <span className="text-tiny text-ink-faint">Retired</span> : null}
          </span>
        )}
      </TableCell>
      <TableCell>
        <StatusColourPicker
          label={`Colour for ${entry.label}`}
          onChange={props.onColourChange}
          value={entry.colour}
        />
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2">
          <Switch
            aria-label={`${entry.label} requires verification`}
            checked={entry.requiresVerification}
            onCheckedChange={props.onVerificationChange}
          />
          <span className="text-tiny text-ink-muted">{entry.requiresVerification ? "Required" : "Not required"}</span>
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-tiny text-ink-muted">
        {entry.pageCount} {entry.pageCount === 1 ? "page" : "pages"}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {props.editing ? null : (
          <Button onClick={props.onStartRename} size="sm" variant="ghost">
            Rename
          </Button>
        )}
        {entry.retired ? (
          <Button onClick={props.onBulkChange} size="sm" variant="ghost">
            Change those pages…
          </Button>
        ) : (
          <Button onClick={props.onRetire} size="sm" variant="ghost">
            Retire
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
