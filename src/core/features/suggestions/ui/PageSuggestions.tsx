import { useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { editorBlocks, type DocumentView } from "../../../client/content";
import { RequestState } from "../../../app/ui/RequestState";
import { BlockView } from "../../editor/ui/blocks/BlockView";
import type { BlockView as StoredBlock } from "../../../shared/api/content";
interface Suggestion {
  id: string;
  page_id: string;
  revision_id: string;
  patch_json: string;
  state: string;
  created_at: string;
}
export function PageSuggestions({ document }: { document: DocumentView }) {
  const resource = useResource<{ items: Suggestion[] }>(
    `/api/suggestions/page/${encodeURIComponent(document.page.id)}`,
  );
  return (
    <details>
      <summary>Suggested page changes</summary>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {resource.data?.items.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            canEdit={document.permissions.canEdit}
            reload={resource.reload}
          />
        ))}
        {resource.data?.items.length === 0 ? (
          <p>No suggestions are waiting.</p>
        ) : null}
      </RequestState>
      {document.permissions.canEdit ||
      document.permissions.level === "comment" ? (
        <SuggestChange document={document} reload={resource.reload} />
      ) : null}
    </details>
  );
}
function SuggestionCard({
  suggestion,
  canEdit,
  reload,
}: {
  suggestion: Suggestion;
  canEdit: boolean;
  reload: () => void | Promise<unknown>;
}) {
  const original = useResource<{ blocks: StoredBlock[] }>(
    `/api/revisions/${suggestion.page_id}/${suggestion.revision_id}`,
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  async function decide(accept: boolean) {
    setPending(true);
    setError(undefined);
    try {
      await mutate(`/api/suggestions/${suggestion.id}/decide`, {
        operationKey: operationKey(),
        accept,
      });
      if (accept)
        window.dispatchEvent(
          new CustomEvent("slate:page-mutated", {
            detail: { pageId: suggestion.page_id },
          }),
        );
      await reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="finding">
      <p className="eyebrow">
        {suggestion.state} · {new Date(suggestion.created_at).toLocaleString()}
      </p>
      <RequestState
        loading={original.loading}
        error={original.error}
        retry={original.reload}
      >
        {original.data?.blocks ? (
          <div className="proposal-diff">
            <section>
              <h4>Before</h4>
              {editorBlocks(original.data.blocks).map((block) => (
                <BlockView
                  key={block.id}
                  block={block}
                  canEdit={false}
                  onChange={() => {}}
                />
              ))}
            </section>
            <section>
              <h4>Suggested revision</h4>
              {editorBlocks(
                JSON.parse(suggestion.patch_json) as StoredBlock[],
              ).map((block) => (
                <BlockView
                  key={block.id}
                  block={block}
                  canEdit={false}
                  onChange={() => {}}
                />
              ))}
            </section>
          </div>
        ) : null}
      </RequestState>
      {canEdit && suggestion.state === "pending" ? (
        <div className="actions">
          <button
            disabled={pending || !original.data?.blocks}
            onClick={() => void decide(true)}
          >
            Accept suggestion
          </button>
          <button disabled={pending} onClick={() => void decide(false)}>
            Reject suggestion
          </button>
        </div>
      ) : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </article>
  );
}
function SuggestChange({
  document,
  reload,
}: {
  document: DocumentView;
  reload: () => void | Promise<unknown>;
}) {
  const [target, setTarget] = useState(""),
    [text, setText] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const paragraphs = document.blocks.filter(
    (block) => block.blockType === "paragraph",
  );
  if (!paragraphs.length) return null;
  return (
    <details>
      <summary>Suggest a paragraph change</summary>
      <form
        className="detail-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(undefined);
          try {
            await mutate(`/api/suggestions/page/${document.page.id}`, {
              operationKey: operationKey(),
              expectedRevisionId: document.page.revisionId,
              blocks: document.blocks.map((block) => ({
                id: block.id,
                parentBlockId: block.parentBlockId,
                blockType: block.blockType,
                treePosition: block.treePosition,
                content:
                  block.id === target ? { text: [{ text }] } : block.content,
              })),
            });
            setText("");
            setTarget("");
            await reload();
          } catch (cause) {
            setError(cause);
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Paragraph
          <select
            required
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">Choose a paragraph</option>
            {paragraphs.map((block, index) => (
              <option key={block.id} value={block.id}>
                Paragraph {index + 1}
              </option>
            ))}
          </select>
        </label>
        {target ? (
          <blockquote>
            {editorBlocks(
              document.blocks.filter((block) => block.id === target),
            ).map((block) => (
              <BlockView
                key={block.id}
                block={block}
                canEdit={false}
                onChange={() => {}}
              />
            ))}
          </blockquote>
        ) : null}
        <label>
          Proposed wording
          <textarea
            required
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <p>
          The page remains unchanged until an editor accepts this suggestion.
        </p>
        <button disabled={pending}>
          {pending ? "Saving suggestion…" : "Propose change"}
        </button>
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
      </form>
    </details>
  );
}
