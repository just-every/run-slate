import { PowerOff, SendHorizontal, Sparkles, Wallet, X } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Button, cn, ScrollArea, Textarea } from "../../../ui";
import { AiAnswerCard } from "./AiAnswerCard";
import { AiFailureNotice } from "./AiFailureNotice";
import { AiNoAuthorityNote } from "./AiNoAuthorityNote";
import { AiRunStatus } from "./AiRunStatus";
import { sentenceCase, type AiChatMessage, type AiFailureReason } from "./types";

/**
 * `AI-015` — the chat panel that answers over the workspace and keeps the
 * conversation. It takes the shape of the reference's right-hand panel: pinned
 * to the viewport, its own scrolling body, its one primary action fixed at the
 * foot.
 *
 * Six states, and `off` is the one that carries the most weight. `AI-001` says
 * no run can start while AI is off, so the off state has no composer at all —
 * not a disabled one — and offers only the route to settings. Over budget is the
 * same shape for the same reason: `AI-012` refuses the run before any request
 * reaches a provider, so the panel must not let one be started.
 */
export type AiPanelState = "off" | "ready" | "running" | "needs-review" | "failed" | "over-budget";

export interface AiPanelProps {
  state: AiPanelState;
  messages: readonly AiChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onOpenRevision: (citationId: string) => void;
  providerLabel?: string | null;
  scopeLabel?: string | null;
  onClose?: () => void;
  /** `state="running"` */
  runElapsedLabel?: string | null;
  onCancelRun?: () => void;
  /** `state="needs-review"` */
  proposalSummary?: string | null;
  onReviewProposal?: () => void;
  /** `state="failed"` */
  failureReason?: AiFailureReason;
  failureDetail?: string | null;
  onRetry?: () => void;
  onDismissFailure?: () => void;
  /** `state="over-budget"` — the month's figures, already formatted. */
  budgetDetail?: string | null;
  /** `state="off"` — `AI-001`: a provider must be configured and an owner must turn AI on. */
  providerConfigured?: boolean;
  viewerIsWorkspaceOwner?: boolean;
  onOpenAiSettings?: () => void;
  className?: string;
}

export function AiPanel({
  state,
  messages,
  draft,
  onDraftChange,
  onSend,
  onOpenRevision,
  providerLabel,
  scopeLabel,
  onClose,
  runElapsedLabel,
  onCancelRun,
  proposalSummary,
  onReviewProposal,
  failureReason = "provider-error",
  failureDetail,
  onRetry,
  onDismissFailure,
  budgetDetail,
  providerConfigured = false,
  viewerIsWorkspaceOwner = false,
  onOpenAiSettings,
  className,
}: AiPanelProps) {
  const off = state === "off";
  const overBudget = state === "over-budget";
  const sendDisabled = state === "running" || draft.trim().length === 0;

  return (
    <aside
      aria-label="Ask AI"
      className={cn("flex h-full w-full flex-col border-line bg-surface sm:w-panel sm:border-l", className)}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Sparkles aria-hidden="true" className="size-4 text-ink-faint" />
        <h2 className="text-ui font-medium text-ink">Ask AI</h2>
        {scopeLabel ? <span className="truncate text-tiny text-ink-faint">{scopeLabel}</span> : null}
        {onClose ? (
          <Button aria-label="Close the AI panel" className="ml-auto" onClick={onClose} size="iconSm" variant="ghost">
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {off ? (
            <AiOffNotice
              onOpenAiSettings={onOpenAiSettings}
              providerConfigured={providerConfigured}
              viewerIsWorkspaceOwner={viewerIsWorkspaceOwner}
            />
          ) : null}

          {overBudget ? (
            <AiFailureNotice detail={budgetDetail} reason="over-budget" />
          ) : null}

          {messages.map((message) =>
            message.author === "member" ? (
              <p
                className="ml-auto max-w-[85%] rounded-card bg-sidebar-hover px-3 py-2 text-ui whitespace-pre-wrap text-ink"
                key={message.id}
              >
                <span className="sr-only">{message.authorName} asked: </span>
                {message.text}
              </p>
            ) : (
              <AiAnswerCard
                key={message.id}
                message={message}
                onOpenRevision={onOpenRevision}
                providerLabel={providerLabel}
                scopeLabel={scopeLabel}
              />
            ),
          )}

          {state === "running" ? (
            <AiRunStatus elapsedLabel={runElapsedLabel} onCancel={onCancelRun} state="running" />
          ) : null}

          {state === "needs-review" ? (
            <div className="flex flex-col gap-2">
              <AiRunStatus state="needs-review" />
              <div className="rounded-card border border-line bg-sidebar p-3">
                <p className="text-tiny text-ink">
                  {proposalSummary ?? "This run produced a proposal."} Nothing has changed yet.
                </p>
                {onReviewProposal ? (
                  <Button className="mt-2" onClick={onReviewProposal} size="sm">
                    Review the proposal
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {state === "failed" ? (
            <AiFailureNotice
              detail={failureDetail}
              onDismiss={onDismissFailure}
              onRetry={onRetry}
              reason={failureReason}
            />
          ) : null}

          {!off ? <AiNoAuthorityNote variant="inline" /> : null}
        </div>
      </ScrollArea>

      {off ? null : (
        <div className="shrink-0 border-t border-line p-3">
          {overBudget ? (
            <p className="flex items-start gap-1.5 text-tiny text-ink-muted">
              <Wallet aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              No question can be sent until next month&apos;s budget, or until a workspace owner raises this month&apos;s.
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!sendDisabled) onSend();
              }}
            >
              <label className="sr-only" htmlFor="ai-panel-question">
                Ask a question about this workspace
              </label>
              <Textarea
                id="ai-panel-question"
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder="Ask a question about this workspace"
                rows={2}
                value={draft}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-micro text-ink-faint">Answers cite the pages and revisions they read.</p>
                <Button disabled={sendDisabled} size="sm" type="submit">
                  <SendHorizontal aria-hidden="true" className="size-3.5" />
                  Ask
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </aside>
  );
}

/** `AI-001` — off until a provider is configured and a workspace owner turns it on. */
function AiOffNotice({
  providerConfigured,
  viewerIsWorkspaceOwner,
  onOpenAiSettings,
}: {
  providerConfigured: boolean;
  viewerIsWorkspaceOwner: boolean;
  onOpenAiSettings?: () => void;
}) {
  const member = knowledgeNoun("member");
  return (
    <section aria-labelledby="ai-off-heading" className="rounded-card border border-line bg-sidebar p-3">
      <h3 className="flex items-center gap-1.5 text-ui font-medium text-ink" id="ai-off-heading">
        <PowerOff aria-hidden="true" className="size-4 text-ink-faint" />
        AI is off
      </h3>
      <p className="mt-1 text-tiny text-ink-muted">
        {providerConfigured
          ? "An AI provider is configured. A workspace owner still has to turn AI on in settings, with a monthly budget greater than zero, before anything can be asked here."
          : "No AI provider is configured. Until one is, and a workspace owner turns AI on in settings with a monthly budget greater than zero, nothing can be asked here."}
      </p>
      <p className="mt-1 text-micro text-ink-faint">
        While AI is off no run can start and no request reaches a provider. Turning it on is recorded in activity.
      </p>
      {viewerIsWorkspaceOwner && onOpenAiSettings ? (
        <Button className="mt-2" onClick={onOpenAiSettings} size="sm" variant="secondary">
          Open AI settings
        </Button>
      ) : (
        <p className="mt-2 text-micro text-ink-faint">
          {sentenceCase(member)}s who are not workspace owners cannot turn this on.
        </p>
      )}
    </section>
  );
}
