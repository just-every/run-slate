import {RunInstrumentation,type RunInstrumentationData} from './RunInstrumentation';
import {ClaimCapture} from "../../claims/ui/ClaimCapture";
import { NativeEffectForm } from "../../effects/ui/NativeEffectForm";
import { RunContinuation } from "./RunContinuation";
import { PrepareDecision } from "../../decisions/ui/PrepareDecision";
import { ProcedurePreparation } from "../../skills/ui/ProcedurePreparation";
import { EvidenceReference } from "../../ai/ui/EvidenceReference";
import { RunChanges } from "../../suggestions/ui/RunChanges";
import { EffectReceipt } from "../../effects/ui/EffectReceipt";
import { useEffect, useState, useId } from "react";
import type { RunView } from "../../../shared/api/work";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
interface Answer {
  statements: {
    text: string;
    evidenceIds: string[];
    kind: string;
    limitations: string[];
  }[];
  unresolved: string[];
  proposedChanges: { targetId: string; text: string; evidenceIds: string[] }[];
  researchPlan?: { hypotheses: { statement: string }[] } | null;
}
export interface RunDocument extends RunView {
  instrumentation?:RunInstrumentationData;
  question?:string;
  selection?:{pageId:string;revisionId:string;blockId:string;start:number;end:number;text:string;action:string};
  canRetainClaim?: boolean;
  pageId?: string;
  inquiryId?: string | null;
  revisionId: string;
  costUnit: string;
  monetaryCost: number | null;
  uncertainCostLiability?: number;
  hardProviderCap?: boolean;
  output?: { answer: Answer } | null;
}
export function RunPanel({ id }: { id: string }) {
  const evidencePrefix = useId();
  const resource = useResource<RunDocument>(
    `/api/runs/${encodeURIComponent(id)}`,
  );
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const run = resource.data;
  const answer = run?.output?.answer;
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    const timer = setTimeout(resource.reload, 5000);
    return () => clearTimeout(timer);
  }, [run, resource.reload]);
  async function control(action: string) {
    if (!run) return;
    setPending(true);
    setError(undefined);
    try {
      await mutate(`/api/runs/${id}/control`, {
        operationKey: operationKey(),
        expectedRevisionId: run.revisionId,
        action,
      });
      await resource.reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  async function review(outcome: "accepted" | "discarded") {
    if (!run) return;
    setPending(true);
    setError(undefined);
    try {
      await mutate(`/api/runs/${id}/review`, {
        operationKey: operationKey(),
        expectedRevisionId: run.revisionId,
        outcome,
      });
      await resource.reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <RequestState
      loading={resource.loading}
      error={resource.error}
      retry={resource.reload}
    >
      {run ? (
        <section className="run-result">
          <p className="eyebrow">{run.status.replaceAll("-", " ")}</p>
          {run.pendingReason ? (
            <p className="request-notice">{run.pendingReason}</p>
          ) : null}
          {answer?.statements.map((statement, index) => (
            <section className="finding-statement" key={index}>
              <span className="statement-kind">
                {statement.evidenceIds.length
                  ? statement.kind
                  : `Unsourced · ${statement.kind}`}
              </span>
              <p>{statement.text}</p>
              {statement.limitations.length ? (
                <ul>
                  {statement.limitations.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              ) : null}
              {statement.evidenceIds.length ? (
                <span className="citation-links">
                  {statement.evidenceIds.map((evidence) => (
                    <a
                      key={evidence}
                      href={`#${evidencePrefix}-${evidence.slice(1)}`}
                      onClick={() => {
                        const target = document.getElementById(
                          `${evidencePrefix}-${evidence.slice(1)}`,
                        );
                        if (target instanceof HTMLDetailsElement) {
                          target.open = true;
                          const parent = target.closest(".finding");
                          if (parent instanceof HTMLDetailsElement)
                            parent.open = true;
                        }
                      }}
                    >
                      Source {evidence.slice(1)}
                    </a>
                  ))}
                </span>
              ) : null}
              {run.canRetainClaim && statement.evidenceIds.length ? <ClaimCapture runId={id} statementIndex={index}/> : null}
            </section>
          ))}
          {answer?.unresolved.length ? (
            <section>
              <h3>Still unknown</h3>
              <ul>
                {answer.unresolved.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {!run.output && ["queued", "running"].includes(run.status) ? (
            <p role="status">
              {run.status === "queued"
                ? "Your question is queued."
                : `Checking ${run.stage}.`}
            </p>
          ) : null}
          {run.status === "needs-review" && answer?.proposedChanges.length ? (
            <RunChanges run={run} reload={resource.reload} />
          ) : null}
          <details className="finding">
            <summary>Why this result?</summary>
            <dl className="run-detail">
              <dt>Current step</dt>
              <dd>{run.stage}</dd>
              <dt>Recorded cost</dt>
              <dd>
                {run.costUnit === "tokens"
                  ? `${run.cost.toLocaleString()} tokens · monetary cost unavailable`
                  : `$${(run.cost / 1_000_000).toFixed(4)}`}
              </dd>
              {run.uncertainCostLiability ? (
                <>
                  <dt>Unsettled possible usage</dt>
                  <dd>
                    {run.costUnit === "tokens"
                      ? `${run.uncertainCostLiability.toLocaleString()} tokens`
                      : `USD ${(run.uncertainCostLiability / 1_000_000).toFixed(4)}`}{" "}
                    · still reserved until reconciled
                  </dd>
                </>
              ) : null}
              <dt>Audience</dt>
              <dd>
                {run.audience.length} permitted member
                {run.audience.length === 1 ? "" : "s"}
              </dd>
            </dl>
            {run.instrumentation?<RunInstrumentation value={run.instrumentation}/>:null}
            <h3>Exact evidence</h3>
            {run.inputRefs.map((ref, index) => (
              <EvidenceReference
                key={`${ref.sourceId}:${ref.sourceRevisionId}`}
                reference={ref}
                index={index}
                idPrefix={evidencePrefix}
              />
            ))}
            {run.completedEffects.length ? (
              <>
                <h3>Confirmed effects</h3>
                {run.completedEffects.map((effect) => (
                  <EffectReceipt
                    key={effect.id}
                    effect={effect}
                    reload={resource.reload}
                  />
                ))}
              </>
            ) : null}
            {run.uncertainEffects.length ? (
              <>
                <h3>Awaiting confirmation</h3>
                {run.uncertainEffects.map((effect) => (
                  <EffectReceipt
                    key={effect.id}
                    effect={effect}
                    reload={resource.reload}
                  />
                ))}
              </>
            ) : null}
          </details>
          {answer &&
          (answer.researchPlan?.hypotheses.length ||
            answer.proposedChanges.length) &&
          run.pageId ? (
            <PrepareDecision runId={run.id} pageId={run.pageId} />
          ) : null}
          {run.kind === "procedure" &&
          run.output &&
          ["needs-review", "completed"].includes(run.status) ? (
            <ProcedurePreparation runId={run.id} />
          ) : null}
          {run.inquiryId ? (
            <a
              className="primary-button"
              href={`/app/inquiries/${run.inquiryId}`}
            >
              Open the investigation
            </a>
          ) : null}
          <div className="actions">
            {run.availableActions
              .filter((action) =>
                ["pause", "resume", "cancel"].includes(action),
              )
              .map((action) => (
                <button
                  type="button"
                  key={action}
                  disabled={pending}
                  onClick={() => void control(action)}
                >
                  {action === "cancel"
                    ? "Stop future work"
                    : action === "pause"
                      ? "Pause"
                      : "Resume"}
                </button>
              ))}
          </div>
          {run.kind === "procedure" && ["queued", "running", "needs-review"].includes(run.status) ? <NativeEffectForm runId={run.id} reload={resource.reload} /> : null}
          {run.status === "needs-review" ? (
            <div className="actions">
              {!answer?.proposedChanges.length ? (
                <button
                  disabled={pending}
                  onClick={() => void review("accepted")}
                >
                  Keep this result
                </button>
              ) : null}
              <button
                disabled={pending}
                onClick={() => void review("discarded")}
              >
                Discard proposal
              </button>
            </div>
          ) : null}
          {run.pageId &&
          ["completed", "failed", "cancelled"].includes(run.status) ? (
            <RunContinuation run={run} />
          ) : null}
          {run.status === "cancelled" ? (
            <p>Future unsent work is stopped. Confirmed receipts remain.</p>
          ) : null}
          {error ? <p role="alert">{errorMessage(error)}</p> : null}
        </section>
      ) : null}
    </RequestState>
  );
}
