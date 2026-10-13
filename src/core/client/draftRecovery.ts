import type { EditorBlock } from "../features/editor/ui/types";
export type PendingEdit = { block: EditorBlock; key: string; revision: string };
export type DraftJournal = {
  version: 1;
  edits: [string, PendingEdit][];
  blocks: EditorBlock[];
};
export function readDraft(key: string): DraftJournal | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as DraftJournal;
    return value.version === 1 &&
      Array.isArray(value.edits) &&
      Array.isArray(value.blocks)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function storeDraft(
  key: string,
  edits: Map<string, PendingEdit>,
  blocks: EditorBlock[],
) {
  if (!edits.size) {
    sessionStorage.removeItem(key);
    return;
  }
  const dirty = new Set(edits.keys());
  sessionStorage.setItem(
    key,
    JSON.stringify({
      version: 1,
      edits: [...edits],
      blocks: blocks.filter((block) => dirty.has(block.id)),
    } satisfies DraftJournal),
  );
}
export function discardDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* nothing to discard */ }
}
/** The browser-storage keys holding one member's unsent edits to one page. */
export function draftKeys(workspaceId: string, memberId: string, pageId: string) {
  return {
    journal: `slate:draft:${workspaceId}:${memberId}:${pageId}`,
    title: `slate:unsaved-title:${workspaceId}:${memberId}:${pageId}`,
  };
}
