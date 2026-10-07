import { useState, useEffect } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
import { EvidenceReference } from "../../ai/ui/EvidenceReference";
interface Step {
  id: string;
  instruction: string;
  state: string;
  source_refs_json: string;
  verification_json: string;
  receipt_json: string | null;
  completed_at: string | null;
}
interface Task {
  id: string;
  state: string;
  steps: Step[];
}
export function GuidedTask({ id }: { id: string }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const resource = useResource<Task>(
    `/api/skills/guided/${encodeURIComponent(id)}`,
  );
  useEffect(() => {
    if (resource.data?.state !== "active" || Object.values(notes).some(Boolean))
      return;
    const timer = setTimeout(resource.reload, 5000);
    return () => clearTimeout(timer);
  }, [resource.data, resource.reload, notes]);
  return (
    <RequestState
      loading={resource.loading}
      error={resource.error}
      retry={resource.reload}
    >
      {resource.data ? (
        <section>
          <h3>
            {resource.data.state === "completed"
              ? "Procedure completed"
              : "Your grounded procedure"}
          </h3>
          <ol>
            {resource.data.steps.map((step) => (
              <GuidedStep
                key={step.id}
                taskId={id}
                step={step}
                reload={resource.reload}
                note={notes[step.id] ?? ""}
                setNote={(value) =>
                  setNotes((previous) => ({ ...previous, [step.id]: value }))
                }
              />
            ))}
          </ol>
        </section>
      ) : null}
    </RequestState>
  );
}
function GuidedStep({
  taskId,
  step,
  reload,
  note,
  setNote,
}: {
  taskId: string;
  step: Step;
  reload: () => void;
  note: string;
  setNote: (value: string) => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const verification = JSON.parse(step.verification_json) as { kind: string };
  const refs = JSON.parse(step.source_refs_json) as {
    kind: "page" | "source";
    sourceId: string;
    revisionId: string;
    passageId?: string;
  }[];
  return (
    <li className="finding">
      <p>{step.instruction}</p>
      {step.state === "completed" ? (
        <p>
          Confirmed{" "}
          {step.completed_at
            ? new Date(step.completed_at).toLocaleString()
            : ""}
        </p>
      ) : (
        <form
          className="detail-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(undefined);
            try {
              await mutate(`/api/skills/guided/${taskId}/verify`, {
                operationKey: operationKey(),
                stepId: step.id,
                ...(verification.kind === "human-action"
                  ? { humanConfirmation: note }
                  : {}),
              });
              setNote("");
              reload();
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}
        >
          {verification.kind === "human-action" ? (
            <label>
              What did you complete?
              <textarea
                required
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Record the action you personally completed."
              />
            </label>
          ) : (
            <p>
              Slate will check the owning system before recording completion.
            </p>
          )}
          <button disabled={pending}>
            {pending
              ? "Checking…"
              : verification.kind === "human-action"
                ? "Record my completion"
                : "Check the owning system"}
          </button>
        </form>
      )}
      <details>
        <summary>Exact instructions & receipt</summary>
        {refs.map((ref, index) => (
          <EvidenceReference
            key={index}
            idPrefix={`step-${step.id}`}
            index={index}
            reference={{
              ...ref,
              sourceRevisionId: ref.revisionId,
              freshness: "rechecked-on-read",
              authorityState: "evidence-not-authority",
            }}
          />
        ))}
        {step.receipt_json ? (
          <pre>{JSON.stringify(JSON.parse(step.receipt_json), null, 2)}</pre>
        ) : (
          <p>No completion receipt yet.</p>
        )}
      </details>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </li>
  );
}
