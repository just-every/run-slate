import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import { askDraftKey, readAskDraft, saveAskDraft } from "./askDraft";
import type {PageSelection} from "./selection";
import { PageSuggestions } from "../../../suggestions/ui/PageSuggestions";
import { ContextDisclosure } from "../../../ai/ui/ContextDisclosure";
import { AiAllowance } from "../../../ai/ui/AiAllowance";
import { StandingAuthority } from "../../../effects/ui/StandingAuthority";
import { useState, useRef, useEffect } from "react";
import type { DocumentView } from "../../../../client/content";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import { RunPanel, type RunDocument } from "../../../runs/ui/RunPanel";
import { PageSkills } from "../../../skills/ui/PageSkills";
import { PageDecisions } from "../../../decisions/ui/PageDecisions";
export function PageAsk({ document,selection }: { document: DocumentView;selection?:PageSelection }) {
  const requestKey = useRef<{ signature: string; key: string } | undefined>(
    undefined,
  );
  const { member } = useWorkspace();
  const draftKey = askDraftKey(member.workspaceId, member.id, document.page.id);
  const availability = useResource<{ enabled: boolean; providerConfigured: boolean; modelPolicyConfigured: boolean }>("/api/ai/availability");
  const canAsk = !!availability.data?.enabled && availability.data.providerConfigured && availability.data.modelPolicyConfigured;
  useEffect(() => {
    setRun(undefined);
    setQuestion(readAskDraft(sessionStorage, draftKey));
    setError(undefined);
    requestKey.current = undefined;
  }, [draftKey]);
  const [question, setQuestion] = useState(() => typeof window === "undefined" ? "" : readAskDraft(sessionStorage, draftKey));
  const [selectionAction,setSelectionAction]=useState("improve");
  const [run, setRun] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const previous = useResource<{ items: RunDocument[] }>(
    `/api/runs?pageId=${encodeURIComponent(document.page.id)}`,
  );
  return (
    <section>
      <h2>{selection ? "Work with selected text" : "Ask about this page"}</h2>
      {selection?<blockquote>{selection.quote}</blockquote>:null}
      <p className="muted">
        Name the outcome. Slate uses the context you can access and keeps
        uncertainty visible.
      </p>
      <AiAllowance />
      {availability.error ? <p role="alert">{errorMessage(availability.error)} <button onClick={() => void availability.reload()}>Check AI availability again</button></p> : null}
      <form
        className="detail-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canAsk || pending) return;
          const data = new FormData(event.currentTarget);
          setPending(true);
          setError(undefined);
          try {
            const signature = JSON.stringify([
              document.page.id,
              document.workingRevisionId,
              question,
              selection ? selectionAction : data.get("kind"),
              selection,
            ]);
            if (requestKey.current?.signature !== signature)
              requestKey.current = { signature, key: operationKey() };
            const result = await mutate<{ value: { id: string } }>(
              data.get("kind") === "investigation"
                ? "/api/inquiries/ask"
                : "/api/ai/ask",
              {
                operationKey: requestKey.current.key,
                pageId: document.page.id,
                question: selection ? `${selectionAction}: ${question || "Apply the named action to the exact selection."}` : question,
                kind: selection ? "edit" : String(data.get("kind")),
                ...(selection ? {selection:{pageId:document.page.id,revisionId:selection.revisionId,blockId:selection.blockId,start:selection.start,end:selection.end,text:selection.quote,action:selectionAction}}:{}),
                refs: [
                  {
                    kind: "page",
                    sourceId: document.page.id,
                    revisionId: selection?.revisionId ?? document.workingRevisionId,
                  },
                ],
              },
            );
            setRun(result.value.id);
            requestKey.current = undefined;
            previous.reload();
          } catch (cause) {
            setError(cause);
          } finally {
            setPending(false);
          }
        }}
      >
        {selection?<label>Writing action<select disabled={!canAsk || pending} value={selectionAction} onChange={e=>setSelectionAction(e.target.value)}>{[['improve','Improve'],['shorten','Shorten'],['expand','Lengthen'],['proofread','Proofread'],['explain','Explain'],['translate','Translate'],['tone','Change tone'],['custom','Free-form instruction']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>:null}
        <label>
          {selection ? "Instructions, target language or tone" : "Your question"}
          <textarea
            required={!selection || ['translate','tone','custom'].includes(selectionAction)}
            value={question}
            onChange={(event) => { setQuestion(event.target.value); saveAskDraft(sessionStorage, draftKey, event.target.value); }}
            placeholder="What did we decide, and what remains?"
          />
        </label>
        {!selection ? <label>
          How can Slate help?
          <select name="kind" defaultValue="answer" disabled={!canAsk || pending}>
            <option value="answer">Answer a question</option>
            <option value="investigation">
              Investigate a difficult question
            </option>
            <option value="procedure">Help me do this work</option>
            <option value="summary">Summarize this page</option>
            <option value="edit">Prepare an edit</option>
          </select>
        </label>:null}
        <button className="primary-button" disabled={pending || !canAsk} type="submit">
          {pending ? "Starting…" : "Ask Slate"}
        </button>
      </form>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {run ? (
        <>
          <a href={`/app/runs/${encodeURIComponent(run)}`}>
            Open the full result
          </a>
          <RunPanel id={run} />
        </>
      ) : null}
      <details>
        <summary>Earlier work on this page</summary>
        <RequestState
          loading={previous.loading}
          error={previous.error}
          retry={previous.reload}
        >
          {previous.data?.items
            .filter((item) => item.id !== run)
            .map((item) => (
              <ContextDisclosure
                key={item.id}
                label={
                  <>
                    {item.kind === "investigation"
                      ? "Investigation"
                      : item.kind === "procedure"
                        ? "Procedure"
                        : item.kind === "edit"
                          ? "Suggested edit"
                          : "Answer"}{" "}
                    · {item.status.replaceAll("-", " ")}
                  </>
                }
              >
                <RunPanel id={item.id} />
              </ContextDisclosure>
            ))}
          {previous.data?.items.length === 0 ? (
            <p>No earlier work on this page.</p>
          ) : null}
        </RequestState>
      </details>
      <ContextDisclosure label="Suggestions & authority">
        <PageSuggestions document={document} />
        <StandingAuthority />
      </ContextDisclosure>
      <PageDecisions
        pageId={document.page.id}
        currentRevisionId={document.workingRevisionId}
      />
      <ContextDisclosure label="Procedures from this page">
        <PageSkills pageId={document.page.id} />
      </ContextDisclosure>
    </section>
  );
}
