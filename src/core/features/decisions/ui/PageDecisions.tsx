import { useFlagshipEnabled } from "../../../app/ui/LaunchProfile";
import { PrepareSuccessor } from "./PrepareSuccessor";
import { ImpactRehearsal } from "../../impact/ui/ImpactRehearsal";
import { DecisionProposal } from "./DecisionProposal";
import { DecisionLineage } from "./DecisionLineage";
import { useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
import { EvidenceReference } from "../../ai/ui/EvidenceReference";
export interface Decision {
  id: string;
  page_id: string;
  question: string;
  outcome: string | null;
  rationale: string | null;
  owner_member_id: string;
  state: string;
  removed_at?:string|null;
  acceptedRevisionId?:string|null;
  acceptedRevisionHref?:string|null;
  revision_id: string;
  review_at: string | null;
  decided_at: string | null;
  overdue: boolean;
  citationsCurrent: boolean;
  superseded_by_decision_id: string | null;
  revision?:{kind:string;actorId:string;createdAt:string}|null;
  content: {
    question?:string;outcome?:string;rationale?:string;
    options: string[];
    citations: {
      kind: "page" | "source";
      sourceId: string;
      revisionId: string;
      passageId?: string;
    }[];
    supersedesId?: string;
  } | null;
}
export function PageDecisions({
  pageId,
  currentRevisionId,
}: {
  pageId: string;
  currentRevisionId?: string;
}) {
  const resource = useResource<{ items: Decision[] }>(
    `/api/decisions?pageId=${encodeURIComponent(pageId)}`,
  );
  const accepted = useResource<{ items: Decision[] }>(
    resource.data?.items.some((item) => item.state === "proposed")
      ? "/api/decisions?state=accepted"
      : null,
  );
  return (
    <RequestState
      loading={resource.loading}
      error={resource.error}
      retry={resource.reload}
    >
      {resource.data?.items.length ? (
        <section>
          <h3>Decisions</h3><a href="/app/decisions">Open decision log</a>
          {resource.data.items.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              siblings={accepted.data?.items ?? []}
              currentRevisionId={currentRevisionId}
              reload={async () => {
                await Promise.all([resource.reload(), accepted.reload()]);
              }}
            />
          ))}
        </section>
      ) : null}
    </RequestState>
  );
}
export function DecisionCard({
  decision,
  siblings,
  reload,
  currentRevisionId,
  readOnly=false,
}: {
  decision: Decision;
  siblings: Decision[];
  readOnly?:boolean;
  reload: () => void | Promise<unknown>;
  currentRevisionId?: string;
}) {
  const flagship = useFlagshipEnabled();
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>(),
    [supersedes, setSupersedes] = useState(
      decision.content?.supersedesId ?? "",
    ),
    [review, setReview] = useState(""),
    [nextReview,setNextReview]=useState("");
  async function submit(action: "accept" | "review") {
    setPending(true);
    setError(undefined);
    try {
      await mutate(
        `/api/decisions/${encodeURIComponent(decision.id)}/${action}`,
        {
          operationKey: operationKey(),
          expectedRevisionId: decision.revision_id,
          ...(action === "accept"
            ? supersedes
              ? { supersedesId: supersedes }
              : {}
            : { note: review, nextReviewAt: nextReview ? new Date(`${nextReview}T00:00:00Z`).toISOString() : null }),
        },
      );
      setReview("");
      await reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="finding" id={`decision-${decision.id}`}>
      <p className="eyebrow">
        {readOnly&&decision.revision?decision.revision.kind:decision.state}
        {!readOnly&&decision.overdue ? " · Review due" : ""}
      </p>
      <h4>{readOnly?decision.content?.question??decision.question:decision.question}</h4>
      <p>{readOnly?decision.content?.outcome??decision.outcome:decision.outcome}</p>
      <p>{readOnly?decision.content?.rationale??decision.rationale:decision.rationale}</p>
      {!decision.citationsCurrent ? (
        <p role="alert">
          Supporting evidence has changed. Review the exact sources before
          accepting a new decision.
        </p>
      ) : null}
      <details>
        <summary>Options & supporting sources</summary>
        <ul>
          {decision.content?.options?.map((option, index) => (
            <li key={index}>{option}</li>
          ))}
        </ul>
        {decision.content?.citations?.map((ref, index) => (
          <EvidenceReference
            key={index}
            idPrefix={`decision-${decision.id}-source`}
            index={index}
            reference={{
              ...ref,
              sourceRevisionId: ref.revisionId,
              freshness: "rechecked-on-read",
              authorityState: "evidence-not-authority",
            }}
          />
        ))}
      </details>
      {flagship && currentRevisionId
        ? decision.content?.citations
            .filter(
              (ref) =>
                ref.kind === "page" &&
                ref.sourceId === decision.page_id &&
                ref.revisionId !== currentRevisionId,
            )
            .map((ref) => (
              <ImpactRehearsal
                key={ref.revisionId}
                source={ref}
                newRevisionId={currentRevisionId}
              />
            ))
        : null}
      {!readOnly && decision.state === "proposed" ? (
        <DecisionProposal decision={decision} reload={reload} />
      ) : null}
      {!readOnly && decision.state === "proposed" && decision.outcome ? (
        <form
          className="detail-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("accept");
          }}
        >
          {siblings.some((item) => item.state === "accepted") ? (
            <label>
              Replaces an earlier decision
              <select
                value={supersedes}
                onChange={(event) => setSupersedes(event.target.value)}
              >
                <option value="">No earlier decision</option>
                {siblings
                  .filter((item) => item.state === "accepted")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.question}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <p>
            Acceptance records this exact decision. Only its appointed owner can
            accept it.
          </p>
          <button
            className="primary-button"
            disabled={pending || !decision.citationsCurrent}
          >
            {pending ? "Recording…" : "Accept decision"}
          </button>
        </form>
      ) : null}
      {!readOnly && decision.state === "accepted" ? (
        <PrepareSuccessor id={decision.id} />
      ) : null}
      {!readOnly && decision.state === "accepted" ? (
        <details>
          <summary>Record a review</summary>
          <form
            className="detail-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit("review");
            }}
          >
            <label>
              What did you conclude?
              <textarea
                required
                value={review}
                onChange={(event) => setReview(event.target.value)}
              />
            </label>
            <label>Next review date<input type="date" value={nextReview} onChange={event=>setNextReview(event.target.value)}/></label>
            <button disabled={pending}>
              {pending ? "Recording…" : "Record review"}
            </button>
          </form>
        </details>
      ) : null}
      {decision.superseded_by_decision_id ? (
        <DecisionLineage
          id={decision.superseded_by_decision_id}
          label="Read the replacement decision"
        />
      ) : null}
      {decision.content?.supersedesId ? (
        <DecisionLineage
          id={decision.content.supersedesId}
          label="Read the earlier decision"
        />
      ) : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </article>
  );
}
