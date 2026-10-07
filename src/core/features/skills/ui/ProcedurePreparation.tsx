import { useRef, useState } from "react";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { GuidedTask } from "./GuidedTask";
export function ProcedurePreparation({ runId }: { runId: string }) {
  const key = useRef(operationKey());
  const [task, setTask] = useState<string>(),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <section>
      {task ? (
        <GuidedTask id={task} />
      ) : (
        <>
          <p>Keep the source checks and completion receipts with this work.</p>
          <button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(undefined);
              try {
                const result = await mutate<{ guidedTaskId: string }>(
                  `/api/skills/from-run/${encodeURIComponent(runId)}`,
                  { operationKey: key.current },
                );
                setTask(result.guidedTaskId);
              } catch (cause) {
                setError(cause);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Preparing…" : "Use this procedure"}
          </button>
        </>
      )}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
