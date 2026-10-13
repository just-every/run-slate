import { useRef, useState } from "react";
import { BlockView } from "../../../editor/ui/blocks/BlockView";
import { discardDraft, readDraft, type draftKeys } from "../../../../client/draftRecovery";

function readTitle(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as { title?: string }).title ?? null : null;
  } catch {
    return null;
  }
}

/**
 * SAVE-004 and SHARE-007: text a writer had not saved when the page stopped
 * being editable for them. It lives only in this tab's browser storage, is shown
 * only to its writer, and is never workspace data, so they can copy it or let it go.
 */
export function UnsavedDraft({ keys, reason }: { keys: ReturnType<typeof draftKeys>; reason: string }) {
  const [draft, setDraft] = useState(() => ({ blocks: readDraft(keys.journal)?.blocks ?? [], title: readTitle(keys.title) }));
  const [copied, setCopied] = useState(false);
  const text = useRef<HTMLDivElement>(null);
  if (!draft.blocks.length && !draft.title) return null;
  return (
    <section className="unsaved-draft" aria-label="Your unsaved text">
      <h2>Your unsaved text</h2>
      <p>{reason} It was not saved to the workspace and is kept only in this browser tab.</p>
      <div ref={text} className="unsaved-draft-text">
        {draft.title ? <p>{draft.title}</p> : null}
        {draft.blocks.map((block) => (
          <BlockView key={block.id} block={block} canEdit={false} onChange={() => {}} />
        ))}
      </div>
      <div className="unsaved-draft-actions">
        <button type="button" onClick={() => void navigator.clipboard.writeText(text.current?.innerText ?? "").then(() => setCopied(true))}>
          Copy text
        </button>
        <button
          type="button"
          onClick={() => {
            discardDraft(keys.journal);
            try { localStorage.removeItem(keys.title); } catch { /* nothing to discard */ }
            setDraft({ blocks: [], title: null });
          }}
        >
          Discard
        </button>
        {copied ? <span role="status">Copied</span> : null}
      </div>
    </section>
  );
}
