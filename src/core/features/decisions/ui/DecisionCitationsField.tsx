import { Link2, Plus, Trash2 } from "lucide-react";
import { Button, cn } from "../../../ui";
import type { DecisionCitation } from "./types";

/**
 * `DEC-006` + `REV-005` — the citations a proposed decision carries.
 *
 * Design decision: a citation names the exact revision it was made against, so
 * the field shows the revision label beside every page and never lets it be
 * typed over. Picking the revision is the caller's job; this field adds and
 * removes.
 */
export interface DecisionCitationsFieldProps {
  citations: readonly DecisionCitation[];
  onAddCitation: () => void;
  onRemoveCitation: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

export function DecisionCitationsField({
  citations,
  onAddCitation,
  onRemoveCitation,
  disabled = false,
  className,
}: DecisionCitationsFieldProps) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)} disabled={disabled}>
      <legend className="pb-1 text-tiny font-medium text-ink-muted">Citations</legend>

      {citations.length === 0 ? (
        <p className="text-ui text-ink-muted">This decision cites no revisions yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {citations.map((citation) => (
            <li className="flex items-center gap-2 rounded-card border border-line px-2 py-1.5" key={citation.id}>
              <Link2 aria-hidden="true" className="size-3.5 shrink-0 text-ink-faint" />
              <span className="flex-1 text-ui text-ink">{citation.pageTitle}</span>
              <span className="text-tiny text-ink-muted">{citation.revisionLabel}</span>
              <Button
                aria-label={`Remove the citation to ${citation.pageTitle} at ${citation.revisionLabel}`}
                onClick={() => onRemoveCitation(citation.id)}
                size="iconSm"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button className="self-start" onClick={onAddCitation} size="sm" variant="secondary">
        <Plus aria-hidden="true" className="size-3.5" />
        Add a citation
      </Button>
    </fieldset>
  );
}
