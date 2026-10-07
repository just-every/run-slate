import { useRef, useState } from "react";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { PageDecisions } from "./PageDecisions";
export function PrepareDecision({
  runId,
  pageId,
}: {
  runId: string;
  pageId: string;
}) {
  const key = useRef(operationKey());
  const [ready, setReady] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <section>
      {ready ? (
        <PageDecisions pageId={pageId} />
      ) : (
        <button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(undefined);
            try {
              await mutate(
                `/api/decisions/from-run/${encodeURIComponent(runId)}`,
                { operationKey: key.current },
              );
              setReady(true);
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}
        >
          {pending
            ? "Preparing…"
            : "Prepare a decision from these alternatives"}
        </button>
      )}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
