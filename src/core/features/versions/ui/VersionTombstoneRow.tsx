import { FileX2 } from "lucide-react";
import { TableCell, TableRow } from "../../../ui";
import type { VersionTombstone } from "./types";

function sentence(ordinal: number, tombstone: VersionTombstone): string {
  return `Version ${ordinal} was deleted by ${tombstone.deletedByName} on ${tombstone.deletedAt}.`;
}

/**
 * `REV-006` — a deleted version leaves a numbered tombstone in history naming who
 * deleted it and when. It carries no content of the deleted version.
 */
export function VersionTombstoneRow({
  ordinal,
  tombstone,
  variant,
  columnCount = 7,
}: {
  ordinal: number;
  tombstone: VersionTombstone;
  /** `table` under `labelled`; `panel` inside the right-hand history panel. */
  variant: "table" | "panel";
  /** How many columns the table has, so the tombstone spans the row. */
  columnCount?: number;
}) {
  if (variant === "panel") {
    return (
      <li className="flex items-start gap-2 px-3 py-2 text-tiny text-ink-faint">
        <FileX2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>{sentence(ordinal, tombstone)}</span>
      </li>
    );
  }

  return (
    <TableRow>
      <TableCell className="text-ink-faint" colSpan={columnCount}>
        <span className="flex items-center gap-2">
          <FileX2 aria-hidden="true" className="size-3.5 shrink-0" />
          {sentence(ordinal, tombstone)}
        </span>
      </TableCell>
    </TableRow>
  );
}
