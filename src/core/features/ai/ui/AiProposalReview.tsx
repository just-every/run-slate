import { CircleCheckBig, Lock } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Button, cn, Separator } from "../../../ui";
import { AiAnswerBoundaryNote } from "./AiAnswerBoundaryNote";
import { AiCitationList } from "./AiCitationList";
import { AiProposalChangeList } from "./AiProposalChangeList";
import { AiStaleInputNotice } from "./AiStaleInputNotice";
import { sentenceCase, type AiAcceptanceRecord, type AiCitation, type AiProposedChange, type AiStaleInput } from "./types";

/**
 * `AI-003`, `AI-005` and `AI-006` in one surface. The clause a member most needs
 * to believe is the first thing on it: a run produces a proposal, and nothing in
 * the workspace changes until this button is pressed. That sentence is the
 * header, not a footnote.
 *
 * Acceptance is gated twice. It needs at least one selected change, because
 * `AI-005` applies only what was selected; and where an input has moved it needs
 * the `AI-006` route to have been taken. Once accepted the surface stops being a
 * form and becomes the record `AI-005` requires — who accepted, which changes,
 * which input revisions, which provider and model.
 */
export interface AiProposalReviewProps {
  title: string;
  changes: readonly AiProposedChange[];
  selectedChangeIds: readonly string[];
  onToggleChange: (changeId: string, next: boolean) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  provider: string;
  model: string;
  /** `AI-005` — the input revisions acceptance will record. */
  inputRevisionLabels: readonly string[];
  citations?: readonly AiCitation[];
  onOpenRevision?: (citationId: string) => void;
  /** `AI-006` — empty when every input is still at the revision the run read. */
  staleInputs?: readonly AiStaleInput[];
  staleAcknowledged?: boolean;
  onRegenerate?: () => void;
  onAcceptAgainstCurrent?: () => void;
  /** `AI-005` — present once accepted; the surface becomes the acceptance record. */
  acceptance?: AiAcceptanceRecord | null;
  onAccept: () => void;
  onDiscard: () => void;
  busy?: boolean;
  className?: string;
}

export function AiProposalReview({
  title,
  changes,
  selectedChangeIds,
  onToggleChange,
  onSelectAll,
  onSelectNone,
  provider,
  model,
  inputRevisionLabels,
  citations = [],
  onOpenRevision,
  staleInputs = [],
  staleAcknowledged = false,
  onRegenerate,
  onAcceptAgainstCurrent,
  acceptance = null,
  onAccept,
  onDiscard,
  busy = false,
  className,
}: AiProposalReviewProps) {
  const blockedByStale = staleInputs.length > 0 && !staleAcknowledged;
  const canAccept = !busy && !blockedByStale && selectedChangeIds.length > 0 && acceptance === null;
  const member = knowledgeNoun("member");

  if (acceptance) {
    return <AcceptedRecord acceptance={acceptance} className={className} title={title} />;
  }

  return (
    <section
      aria-labelledby="ai-proposal-heading"
      className={cn("flex flex-col gap-3 rounded-card border border-line bg-surface p-4", className)}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-h3 font-semibold text-ink" id="ai-proposal-heading">
          {title}
        </h2>
        <p className="flex items-start gap-1.5 text-tiny text-ink-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          This is a proposal. Nothing in the workspace has changed and nothing will until a {member} accepts it — and
          then only the changes ticked below.
        </p>
      </header>

      {staleInputs.length > 0 && onRegenerate && onAcceptAgainstCurrent ? (
        <AiStaleInputNotice
          acknowledged={staleAcknowledged}
          inputs={staleInputs}
          onAcceptAgainstCurrent={onAcceptAgainstCurrent}
          onRegenerate={onRegenerate}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-tiny text-ink-muted" role="status">
          {selectedChangeIds.length} of {changes.length} {changes.length === 1 ? "change" : "changes"} selected
        </p>
        <div className="flex items-center gap-1">
          {onSelectAll ? (
            <Button onClick={onSelectAll} size="sm" variant="ghost">
              Select all
            </Button>
          ) : null}
          {onSelectNone ? (
            <Button onClick={onSelectNone} size="sm" variant="ghost">
              Select none
            </Button>
          ) : null}
        </div>
      </div>

      <AiProposalChangeList changes={changes} onToggle={onToggleChange} selectedIds={selectedChangeIds} />

      {citations.length > 0 && onOpenRevision ? (
        <>
          <Separator />
          <AiCitationList citations={citations} onOpenRevision={onOpenRevision} />
        </>
      ) : null}

      <Separator />

      <dl className="grid gap-x-4 gap-y-1 text-tiny sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="text-ink-faint">Provider</dt>
          <dd className="text-ink-muted">{provider}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-ink-faint">Model</dt>
          <dd className="text-ink-muted">{model}</dd>
        </div>
        <div className="flex gap-1.5 sm:col-span-2">
          <dt className="shrink-0 text-ink-faint">Read from</dt>
          <dd className="text-ink-muted">{inputRevisionLabels.join(", ")}</dd>
        </div>
      </dl>
      <p className="text-micro text-ink-faint">
        Accepting records you, the changes you ticked, those input revisions and the provider and model. The changes and
        their activity entries commit together or not at all.
      </p>

      <AiAnswerBoundaryNote />

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!canAccept} onClick={onAccept}>
          {busy ? "Applying…" : `Accept ${selectedChangeIds.length} ${selectedChangeIds.length === 1 ? "change" : "changes"}`}
        </Button>
        <Button disabled={busy} onClick={onDiscard} variant="secondary">
          Discard
        </Button>
        <p className="text-micro text-ink-faint">
          {blockedByStale
            ? "Choose regenerate or accept against the current revision first."
            : selectedChangeIds.length === 0
              ? "Tick at least one change to accept."
              : "Discarding records the rejection on the run and changes nothing."}
        </p>
      </div>
    </section>
  );
}

function AcceptedRecord({
  acceptance,
  title,
  className,
}: {
  acceptance: AiAcceptanceRecord;
  title: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="ai-proposal-accepted-heading"
      className={cn("flex flex-col gap-3 rounded-card border border-line bg-surface p-4", className)}
    >
      <h2 className="flex items-center gap-1.5 text-h3 font-semibold text-ink" id="ai-proposal-accepted-heading">
        <CircleCheckBig aria-hidden="true" className="size-4 text-good" />
        {title} — accepted
      </h2>
      <p className="text-tiny text-ink-muted">
        {sentenceCase(knowledgeNoun("member"))}: {acceptance.acceptedBy.name}, {acceptance.acceptedAtLabel}.
      </p>

      <div>
        <h3 className="text-tiny font-medium text-ink-muted">Changes applied</h3>
        <ul className="mt-1 flex flex-col gap-1">
          {acceptance.appliedChangeSummaries.map((summary) => (
            <li className="flex items-start gap-1.5 text-tiny text-ink" key={summary}>
              <CircleCheckBig aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-good" />
              {summary}
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-tiny sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="text-ink-faint">Provider</dt>
          <dd className="text-ink-muted">{acceptance.provider}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-ink-faint">Model</dt>
          <dd className="text-ink-muted">{acceptance.model}</dd>
        </div>
        <div className="flex gap-1.5 sm:col-span-2">
          <dt className="shrink-0 text-ink-faint">Input revisions</dt>
          <dd className="text-ink-muted">{acceptance.inputRevisionLabels.join(", ")}</dd>
        </div>
      </dl>
    </section>
  );
}
