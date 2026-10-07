import { useState } from "react";
import type { EffectView } from "../../../shared/api/work";
import { mutate, errorMessage } from "../../../client/transport";
export function EffectReceipt({
  effect,
  reload,
}: {
  effect: EffectView;
  reload: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const uncertain = ["uncertain", "dispatched"].includes(effect.state);
  return (
    <article className="finding">
      <h4>{effect.operation}</h4>
      <p>
        {effect.state === "confirmed"
          ? "Confirmed by the owning system"
          : uncertain
            ? "Confirmation is still unknown"
            : effect.state}
      </p>
      {effect.confirmedAt ? (
        <p>{new Date(effect.confirmedAt).toLocaleString()}</p>
      ) : null}
      {uncertain ? (
        <>
          <p>
            No duplicate update will be sent. Check the owning system for an
            attributable receipt.
          </p>
          <button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(undefined);
              try {
                await mutate(
                  `/api/effects/${encodeURIComponent(effect.id)}/reconcile`,
                  {},
                );
                reload();
              } catch (cause) {
                setError(cause);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Checking…" : "Check confirmation"}
          </button>
        </>
      ) : null}
      <details>
        <summary>Receipt & observed state</summary>
        <p>Target: {effect.target.id}</p>
        <pre>
          {JSON.stringify(
            {
              receipt: effect.receipt ?? null,
              observedState: effect.observedState ?? null,
            },
            null,
            2,
          )}
        </pre>
      </details>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </article>
  );
}
