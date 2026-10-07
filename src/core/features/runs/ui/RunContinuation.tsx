import { useState, useRef } from "react";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RunPanel, type RunDocument } from "./RunPanel";
export function RunContinuation({ run }: { run: RunDocument }) {
  const [question, setQuestion] = useState(""),
    [next, setNext] = useState<string>(),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const key = useRef<{ question: string; key: string } | undefined>(undefined);
  return next ? (
    <RunPanel id={next} />
  ) : (
    <details>
      <summary>Continue with a new question</summary>
      <form
        className="detail-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(undefined);
          try {
            if (key.current?.question !== question)
              key.current = { question, key: operationKey() };
            const result = await mutate<{ value: { id: string } }>(
              `/api/runs/${encodeURIComponent(run.id)}/successor`,
              {
                operationKey: key.current.key,
                pageId: run.pageId,
                question,
                kind: run.kind,
                refs: run.inputRefs.map((ref) => ({
                  kind: (ref as { kind?: string }).kind,
                  sourceId: ref.sourceId,
                  revisionId: ref.sourceRevisionId,
                  ...(ref.passageId ? { passageId: ref.passageId } : {}),
                })),
              },
            );
            setNext(result.value.id);
          } catch (cause) {
            setError(cause);
          } finally {
            setPending(false);
          }
        }}
      >
        <p>
          This starts linked work after current access, evidence, and earlier
          uncertain effects are checked.
        </p>
        <label>
          What should Slate do next?
          <textarea
            required
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <button disabled={pending}>
          {pending ? "Starting…" : "Start linked work"}
        </button>
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
      </form>
    </details>
  );
}
