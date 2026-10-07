import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../ui";
import type { AiUsageByDay, AiUsageByFeature } from "./types";

/**
 * `AI-010` — the totals settings shows: by day and by feature. Every figure
 * here is recorded by a run. Nothing on this pane is calculated from an
 * estimate, and a period with no run shows as empty rather than as zero cost.
 */
export function AiUsageTables({
  byDay,
  byFeature,
}: {
  byDay: readonly AiUsageByDay[];
  byFeature: readonly AiUsageByFeature[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="flex flex-col gap-2">
        <h3 className="text-ui font-medium text-ink">By day</h3>
        {byDay.length === 0 ? (
          <p className="text-ui text-ink-muted">No run has been recorded this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDay.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.runs}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.cost}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-ui font-medium text-ink">By feature</h3>
        {byFeature.length === 0 ? (
          <p className="text-ui text-ink-muted">No feature has started a run this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byFeature.map((row) => (
                  <TableRow key={row.feature}>
                    <TableCell>{row.feature}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.runs}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.cost}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
