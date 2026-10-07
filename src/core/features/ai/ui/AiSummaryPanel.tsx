import { Copy, History, TextQuote } from "lucide-react";
import { Button, cn, Tabs, TabsContent, TabsList, TabsTrigger } from "../../../ui";
import { AiAnswerBoundaryNote } from "./AiAnswerBoundaryNote";
import { AiCitationList } from "./AiCitationList";
import { AiRunStatus } from "./AiRunStatus";
import type { AiCitation, AiRunState, AiSummarySubject } from "./types";

/**
 * `AI-016` — three subjects, one panel. The revision the summary read is named
 * on the summary itself rather than only in the citations, because a summary
 * outlives the page state it describes and a reader needs to know which state
 * that was.
 *
 * The result is text and only text: insert below, or copy. There is no action
 * here that writes into the page by itself — replacing the body would be a
 * mutation without acceptance, which `AI-003` does not allow.
 */
const subjectLabel: Record<AiSummarySubject, string> = {
  page: "This page",
  comments: "Comment threads",
  difference: "Between two revisions",
};

export interface AiSummaryPanelProps {
  subject: AiSummarySubject;
  onSubjectChange: (subject: AiSummarySubject) => void;
  pageTitle: string;
  /** The revision the summary read — required for `page` and `comments`. */
  revisionLabel: string;
  /** The two ends of a difference summary. */
  compareFromLabel?: string | null;
  compareToLabel?: string | null;
  /** How many threads a comment summary read, already counted. */
  threadCountLabel?: string | null;
  summary: string | null;
  runState?: AiRunState | null;
  onGenerate: () => void;
  onCancelRun?: () => void;
  onInsertBelow: () => void;
  onCopy: () => void;
  onDiscard: () => void;
  citations?: readonly AiCitation[];
  onOpenRevision?: (citationId: string) => void;
  providerLabel?: string | null;
  className?: string;
}

export function AiSummaryPanel({
  subject,
  onSubjectChange,
  pageTitle,
  revisionLabel,
  compareFromLabel,
  compareToLabel,
  threadCountLabel,
  summary,
  runState = null,
  onGenerate,
  onCancelRun,
  onInsertBelow,
  onCopy,
  onDiscard,
  citations = [],
  onOpenRevision,
  providerLabel,
  className,
}: AiSummaryPanelProps) {
  const readLabel =
    subject === "difference" && compareFromLabel && compareToLabel
      ? `${compareFromLabel} → ${compareToLabel}`
      : revisionLabel;

  return (
    <section
      aria-labelledby="ai-summary-heading"
      className={cn("flex w-full max-w-reading flex-col gap-3 rounded-card border border-line bg-surface p-4", className)}
    >
      <header>
        <h2 className="flex items-center gap-1.5 text-h3 font-semibold text-ink" id="ai-summary-heading">
          <TextQuote aria-hidden="true" className="size-4 text-ink-faint" />
          Summarise
        </h2>
        <p className="mt-0.5 truncate text-tiny text-ink-muted">{pageTitle}</p>
      </header>

      <Tabs onValueChange={(value) => onSubjectChange(value as AiSummarySubject)} value={subject}>
        <TabsList>
          {(Object.keys(subjectLabel) as AiSummarySubject[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {subjectLabel[key]}
            </TabsTrigger>
          ))}
        </TabsList>
        {(Object.keys(subjectLabel) as AiSummarySubject[]).map((key) => (
          <TabsContent key={key} value={key}>
            <p className="text-tiny text-ink-muted">
              {key === "page"
                ? "A summary of the page as it stands at the revision below."
                : key === "comments"
                  ? `A summary of the discussion on this page${threadCountLabel ? `, across ${threadCountLabel}` : ""}.`
                  : "A summary of what changed between two revisions."}
            </p>
          </TabsContent>
        ))}
      </Tabs>

      <p className="flex items-center gap-1.5 text-tiny text-ink-faint">
        <History aria-hidden="true" className="size-3.5" />
        Read from {readLabel}
      </p>

      {runState && runState !== "completed" ? <AiRunStatus onCancel={onCancelRun} state={runState} /> : null}

      {summary === null ? (
        <div>
          <Button onClick={onGenerate}>Summarise</Button>
          <p className="mt-1.5 text-micro text-ink-faint">
            The summary comes back as text. It is never written into the page on its own.
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-micro font-medium text-ink-faint">Summary of {readLabel}</p>
            <p className="mt-1 rounded-control bg-sidebar px-2.5 py-2 text-body whitespace-pre-wrap text-ink">{summary}</p>
          </div>

          {citations.length > 0 && onOpenRevision ? (
            <AiCitationList citations={citations} numbered={false} onOpenRevision={onOpenRevision} />
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <Button onClick={onInsertBelow} size="sm">
              Insert below
            </Button>
            <Button onClick={onCopy} size="sm" variant="secondary">
              <Copy aria-hidden="true" className="size-3.5" />
              Copy
            </Button>
            <Button onClick={onDiscard} size="sm" variant="ghost">
              Discard
            </Button>
          </div>
          <p className="text-micro text-ink-faint">
            Insert below adds it as a new block under the page. Nothing replaces what is already there.
          </p>

          <AiAnswerBoundaryNote providerLabel={providerLabel} scopeLabel={pageTitle} />
        </>
      )}
    </section>
  );
}
