import { Badge, cn, EmptyState, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "../../../ui";
import { aiFeatureLabel, aiRunStateLabel, type AiRunState, type AiUsageRow } from "./types";

/**
 * `AI-010` — every column the clause names, in the order a reader asks the
 * questions: when, what started it, what ran it, how much it used, what it cost,
 * how long it took, how it ended. A failed or cancelled run is still a row,
 * because a refused or broken run is exactly what someone auditing spend needs
 * to see.
 *
 * The status cell carries its label, never a bare colour, and the table scrolls
 * inside its own container so a narrow viewport never pushes the page sideways.
 */
const statusTone: Record<AiRunState, "neutral" | "accent" | "good" | "warn" | "danger" | "draft"> = {
  queued: "neutral",
  running: "accent",
  "needs-review": "warn",
  completed: "good",
  cancelled: "neutral",
  failed: "danger",
};

export interface AiUsageTableProps {
  rows: readonly AiUsageRow[];
  /** `AI-010` — the total for the period on show, already calculated. */
  totalCostLabel?: string | null;
  /** Names the period and grouping the rows belong to, e.g. "March 2026, by day". */
  caption?: string | null;
  className?: string;
}

export function AiUsageTable({ rows, totalCostLabel, caption, className }: AiUsageTableProps) {
  if (rows.length === 0) {
    return <EmptyState className={className} description="No AI run has been recorded for this period." title="No usage yet" />;
  }

  return (
    <div className={cn("overflow-x-auto rounded-card border border-line", className)}>
      <Table>
        {caption ? <caption className="px-3 py-2 text-left text-tiny text-ink-muted">{caption}</caption> : null}
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Started</TableHead>
            <TableHead scope="col">Feature</TableHead>
            <TableHead scope="col">Provider</TableHead>
            <TableHead scope="col">Model</TableHead>
            <TableHead scope="col">Usage</TableHead>
            <TableHead scope="col">Cost</TableHead>
            <TableHead scope="col">Duration</TableHead>
            <TableHead scope="col">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-ink-muted">{row.startedAtLabel}</TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="text-ink">{aiFeatureLabel[row.feature]}</span>
                {row.agentName ? <span className="block text-micro text-ink-faint">{row.agentName}</span> : null}
              </TableCell>
              <TableCell className="whitespace-nowrap text-ink-muted">{row.provider}</TableCell>
              <TableCell className="whitespace-nowrap text-ink-muted">{row.model}</TableCell>
              <TableCell className="whitespace-nowrap text-ink-muted">
                {row.units} {row.unitKind}
              </TableCell>
              <TableCell className="whitespace-nowrap text-ink">{row.cost}</TableCell>
              <TableCell className="whitespace-nowrap text-ink-muted">{row.duration}</TableCell>
              <TableCell className="whitespace-nowrap">
                <Badge tone={statusTone[row.status]}>{aiRunStateLabel[row.status]}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {totalCostLabel ? (
          <TableFooter>
            <TableRow>
              <TableCell className="text-ink-muted" colSpan={5}>
                Total
              </TableCell>
              <TableCell className="font-medium whitespace-nowrap text-ink">{totalCostLabel}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}
