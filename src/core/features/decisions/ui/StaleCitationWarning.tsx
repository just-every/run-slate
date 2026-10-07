import { TriangleAlert } from "lucide-react";
import { Button, cn } from "../../../ui";
import type { DecisionCitation } from "./types";

/**
 * `DEC-003` + `REV-005` — the cited page has been edited since the decision was
 * accepted.
 *
 * Design decision: the warning is attached to the citation, never to the
 * rationale, and it says in as many words that the accepted rationale was not
 * rewritten. The two ways out are offered side by side: the revision the
 * decision actually cites, and the page as it stands now. Warn tone plus a
 * glyph plus the words — nothing here is carried by colour.
 */
export interface StaleCitationWarningProps {
  citation: DecisionCitation;
  onOpenCitedRevision: (citation: DecisionCitation) => void;
  onOpenCurrent: (citation: DecisionCitation) => void;
  className?: string;
}

export function StaleCitationWarning({
  citation,
  onOpenCitedRevision,
  onOpenCurrent,
  className,
}: StaleCitationWarningProps) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 rounded-card border border-warn/30 bg-warn-soft p-2.5", className)}
      role="note"
    >
      <p className="flex items-start gap-1.5 text-tiny font-medium text-warn">
        <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        This citation is no longer current
      </p>
      <p className="text-tiny text-ink-muted">
        The decision cites {citation.revisionLabel} of {citation.pageTitle}
        {citation.newerRevisionLabel ? <>, and a newer revision exists ({citation.newerRevisionLabel}).</> : <>, and a newer revision exists.</>}{" "}
        The accepted rationale is unchanged — it was not rewritten.
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button onClick={() => onOpenCitedRevision(citation)} size="sm" variant="secondary">
          Open the cited revision
        </Button>
        <Button onClick={() => onOpenCurrent(citation)} size="sm" variant="ghost">
          Open the current page
        </Button>
      </div>
    </div>
  );
}
