import { Info, Sparkles } from "lucide-react";
import { useId } from "react";
import { Badge, Button, Skeleton, cn } from "../../../ui";
import { memberNoun } from "./nouns";
import type { GeneratedAnswerCitation, GeneratedAnswerState, GeneratedAnswerStatement } from "./types";

const caveat = `Written only from what you may read, and it can be wrong. Open a source before relying on it.`;

/**
 * `AI-015` — the same generated answer the chat panel gives, placed above the
 * results with the same citations and the same caveat. `AI-004` — every
 * statement it cannot cite is labelled unsourced. `SEARCH-008` — with the
 * provider unconfigured, disabled, failing or over budget the state is `absent`
 * and this renders nothing at all, not an empty card.
 */
export function GeneratedAnswerCard({
  answerState,
  onOpenCitation,
  className,
}: {
  answerState: GeneratedAnswerState;
  /** Opens the cited revision (`AI-004`). */
  onOpenCitation: (citationId: string) => void;
  className?: string;
}) {
  const headingId = useId();
  if (answerState.kind === "absent") return null;

  return (
    <section aria-labelledby={headingId} className={cn("rounded-card border border-line bg-surface", className)}>
      <div className="flex items-center gap-1.5 px-4 pt-3">
        <Sparkles aria-hidden="true" className="size-4 text-ink-faint" />
        <h2 className="text-tiny font-medium tracking-wide text-ink-muted uppercase" id={headingId}>
          Answer
        </h2>
      </div>

      {answerState.kind === "loading" ? (
        <div aria-busy="true" className="flex flex-col gap-2 px-4 py-3">
          <span className="sr-only">Writing an answer from what you can read</span>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}

      {answerState.kind === "not-found" ? (
        <p className="px-4 py-3 text-body text-ink">I could not find that in what you can read.</p>
      ) : null}

      {answerState.kind === "present" ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-col gap-2">
            {answerState.statements.map((statement) => (
              <AnswerStatement key={statement.id} statement={statement} />
            ))}
          </div>
          <AnswerCitations citations={answerState.citations} onOpenCitation={onOpenCitation} />
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 border-t border-line px-4 py-2 text-tiny text-ink-muted">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <span>{`${caveat} No other ${memberNoun}’s private pages were read to write it.`}</span>
      </p>
    </section>
  );
}

function AnswerStatement({ statement }: { statement: GeneratedAnswerStatement }) {
  return (
    <p className="text-body text-ink">
      {statement.text}
      {statement.sourced ? null : (
        <>
          {" "}
          <Badge tone="warn">Unsourced</Badge>
        </>
      )}
    </p>
  );
}

function AnswerCitations({
  citations,
  onOpenCitation,
}: {
  citations: readonly GeneratedAnswerCitation[];
  onOpenCitation: (citationId: string) => void;
}) {
  if (citations.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-tiny text-ink-muted">Drawn from</span>
      {citations.map((citation) => (
        <Button
          className="h-6 gap-1 rounded-full border-line px-2 text-tiny font-normal"
          key={citation.id}
          onClick={() => onOpenCitation(citation.id)}
          variant="secondary"
        >
          <span className="text-ink">{citation.pageTitle}</span>
          <span className="text-ink-faint">{citation.revisionLabel}</span>
        </Button>
      ))}
    </div>
  );
}
