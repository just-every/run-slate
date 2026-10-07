import { useState } from "react";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import type { Decision } from "./PageDecisions";
import {DecisionFields,type DecisionDraft} from './DecisionFields';
import {ContextDisclosure} from '../../ai/ui/ContextDisclosure';
export function DecisionProposal({
  decision,
  reload,
}: {
  decision: Decision;
  reload: () => void;
}) {
  const [outcome, setOutcome] = useState(decision.outcome ?? ""),
    [rationale, setRationale] = useState(decision.rationale ?? ""),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const [draft,setDraft]=useState<DecisionDraft>({question:decision.question,options:(decision.content?.options??[]).join('\n'),ownerId:decision.owner_member_id,decidedAt:decision.decided_at,reviewAt:decision.review_at,citations:decision.content?.citations??[]});
  return (
    <details open={!decision.outcome}>
      <summary>Choose the outcome</summary>
      <form
        className="detail-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(undefined);
          try {
            await mutate("/api/decisions", {
              operationKey: operationKey(),
              id: decision.id,
              pageId: decision.page_id,
              expectedRevisionId: decision.revision_id,
              question: draft.question,
              options: draft.options.split('\n').map(value=>value.trim()).filter(Boolean),
              outcome,
              rationale,
              ownerId: draft.ownerId,
              decidedAt: draft.decidedAt,
              reviewAt: draft.reviewAt,
              citations: draft.citations,
            });
            reload();
          } catch (cause) {
            setError(cause);
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Decision
          <textarea
            required
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            placeholder="Which outcome should this decision record?"
          />
        </label>
        <ContextDisclosure label="Question, owner, dates & evidence"><DecisionFields draft={draft} change={setDraft}/></ContextDisclosure>
        <label>
          Why this choice?
          <textarea
            required
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
          />
        </label>
        <button disabled={pending}>
          {pending ? "Saving…" : "Save proposed decision"}
        </button>
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
      </form>
    </details>
  );
}
