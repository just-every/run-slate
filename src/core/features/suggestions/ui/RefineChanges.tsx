import { useRef, useState } from "react";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RunPanel, type RunDocument } from "../../runs/ui/RunPanel";
export function RefineChanges({ run }: { run: RunDocument }) {
  const [instruction, setInstruction] = useState(""),
    [next, setNext] = useState<string>(),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const key = useRef<{ instruction: string; key: string } | undefined>(
    undefined,
  );
  return (
    <details>
      <summary>Refine the suggestion</summary>
      {next ? (
        <RunPanel id={next} />
      ) : (
        <form
          className="detail-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(undefined);
            try {
              if (key.current?.instruction !== instruction)
                key.current = { instruction, key: operationKey() };
              const result = await mutate<{ value: { id: string } }>(
                `/api/runs/${encodeURIComponent(run.id)}/refine`,
                {operationKey:key.current.key,expectedRevisionId:run.revisionId,instruction},
              );
              setNext(result.value.id);
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            What should change?
            <textarea
              required
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
          </label>
          <button disabled={pending}>
            {pending ? "Refining…" : "Prepare a refined suggestion"}
          </button>
          {error ? <p role="alert">{errorMessage(error)}</p> : null}
        </form>
      )}
    </details>
  );
}
