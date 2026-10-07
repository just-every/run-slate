import { useRef, useState } from "react";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
export function PrepareSuccessor({ id }: { id: string }) {
  const key = useRef(operationKey()),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <section>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(undefined);
          try {
            const result = await mutate<{ value: { id: string; pageId: string } }>(
              `/api/decisions/${encodeURIComponent(id)}/propose-successor`,
              { operationKey: key.current },
            );
            window.location.assign(
              `/app/decisions/${encodeURIComponent(result.value.id)}`,
            );
          } catch (cause) {
            setError(cause);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Preparing…" : "Prepare a replacement decision"}
      </button>
      <p className="muted">
        The accepted decision stays unchanged while its replacement is
        considered.
      </p>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
