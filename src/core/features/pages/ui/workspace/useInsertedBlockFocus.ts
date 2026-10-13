import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { EditorBlock } from "../../../editor/ui/types";

interface FocusIntent {
  pageId: string;
  blockId: string;
}

/** A successful insertion owns focus only until the next user focus intent. */
export function useInsertedBlockFocus(
  root: RefObject<HTMLDivElement | null>,
  pageId: string,
  blocks: EditorBlock[],
  canEdit: boolean,
) {
  const pending = useRef<FocusIntent | null>(null);
  const [ready, setReady] = useState<FocusIntent | null>(null);

  useLayoutEffect(() => {
    const cancel = () => { pending.current = null; };
    const navigate = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key === "Escape") cancel();
    };
    // Capture sees the user's next action before its handlers start another
    // insertion. Removing the menu does not itself produce a focusin event.
    document.addEventListener("pointerdown", cancel, true);
    document.addEventListener("focusin", cancel, true);
    document.addEventListener("keydown", navigate, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", cancel, true);
      document.removeEventListener("focusin", cancel, true);
      document.removeEventListener("keydown", navigate, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
    };
  }, [pageId]);

  useLayoutEffect(() => {
    if (!canEdit || !ready || pending.current !== ready || ready.pageId !== pageId) return;
    if (!blocks.some(block => block.id === ready.blockId)) return;
    const row = root.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(ready.blockId)}"]`);
    if (!row) return;
    // React has committed the saved block and enabled its editable. Consume
    // once, including blocks without a text input, before focus dispatches.
    pending.current = null;
    row.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }, [ready, blocks, canEdit, pageId, root]);

  return (blockId: string) => {
    const intent = { pageId, blockId };
    pending.current = intent;
    return (saved: boolean) => {
      if (pending.current !== intent) return;
      if (saved) setReady(intent);
      else pending.current = null;
    };
  };
}
