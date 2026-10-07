import { CircleSlash, FileText, History } from "lucide-react";
import { cn } from "../../../ui";
import type { AiCitation, AiUnsourcedStatement } from "./types";

/**
 * `AI-004` — what the output drew on. Each citation names the page *and* the
 * revision, and the whole row is the control that opens that revision
 * (`REV-005`), so the accessible name says which revision it opens rather than
 * just "open".
 *
 * The unsourced block is the other half of the clause and is not decoration: a
 * statement the product cannot cite is shown apart from the citations, under a
 * heading that says it is not drawn from the workspace, so it can never be read
 * as sourced.
 */
export function AiCitationList({
  citations,
  unsourced = [],
  onOpenRevision,
  /** Numbering matches markers in the answer body where the surface renders them. */
  numbered = true,
  className,
}: {
  citations: readonly AiCitation[];
  unsourced?: readonly AiUnsourcedStatement[];
  onOpenRevision: (citationId: string) => void;
  numbered?: boolean;
  className?: string;
}) {
  const hasCitations = citations.length > 0;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {hasCitations ? (
        <section aria-labelledby="ai-citations-heading">
          <h3 className="text-tiny font-medium text-ink-muted" id="ai-citations-heading">
            Sources ({citations.length})
          </h3>
          <ul className="mt-1.5 flex flex-col gap-1">
            {citations.map((citation, index) => (
              <li key={citation.id}>
                <CitationRow
                  citation={citation}
                  index={numbered ? index + 1 : null}
                  onOpen={() => onOpenRevision(citation.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unsourced.length > 0 ? (
        <section aria-labelledby="ai-unsourced-heading" className="rounded-card border border-warn/30 bg-warn-soft p-2.5">
          <h3 className="flex items-center gap-1.5 text-tiny font-medium text-warn" id="ai-unsourced-heading">
            <CircleSlash aria-hidden="true" className="size-3.5" />
            Unsourced — not drawn from the workspace
          </h3>
          <p className="mt-1 text-tiny text-ink-muted">
            These statements could not be traced to a page revision. They are not presented as anything this workspace
            says.
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {unsourced.map((statement) => (
              <li className="flex items-start gap-1.5 text-tiny text-ink" key={statement.id}>
                <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-warn" />
                <span>{statement.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CitationRow({ citation, index, onOpen }: { citation: AiCitation; index: number | null; onOpen: () => void }) {
  return (
    <button
      aria-label={`Open ${citation.pageTitle} at ${citation.revisionLabel}`}
      className="flex w-full items-start gap-2 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-sidebar-hover"
      onClick={onOpen}
      type="button"
    >
      {index === null ? (
        <FileText aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
      ) : (
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-sidebar-hover text-micro font-medium text-ink-muted"
        >
          {index}
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-tiny font-medium text-ink">{citation.pageTitle}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-micro text-ink-faint">
          <History aria-hidden="true" className="size-3" />
          {citation.revisionLabel}
          {citation.containerLabel ? <span>· {citation.containerLabel}</span> : null}
          {citation.newerRevisionLabel ? <span className="text-warn">· a newer revision exists</span> : null}
        </span>
        {citation.excerpt ? <span className="line-clamp-2 text-micro text-ink-muted">{citation.excerpt}</span> : null}
      </span>
    </button>
  );
}
