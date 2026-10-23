import { isRichTextEmpty, type EditorBlock } from "../../../editor/ui/types";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}

export function sameBlock(a: EditorBlock, b: EditorBlock | undefined) {
  if (!b || a.id !== b.id || a.type !== b.type || (a.indent ?? 0) !== (b.indent ?? 0)) return false;
  const {id: _a, type: _at, indent: _ai, synced: _as, copyRevisionId: _ar, ...left} = a;
  const {id: _b, type: _bt, indent: _bi, synced: _bs, copyRevisionId: _br, ...right} = b;
  return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
}

/** A recovery copy is an uncertain insertion, never authority over saved blocks. */
export function recoverInsertion(draft: EditorBlock[], saved: EditorBlock[], expected: Record<string, string> | undefined, revisions: Record<string, string>) {
  const blocks = [...saved], conflicts: EditorBlock[] = [];
  for (const block of draft) {
    const live = saved.find(item => item.id === block.id);
    if (live) {
      if (sameBlock(block, live)) continue;
      if (expected?.[block.id] && expected[block.id] === revisions[block.id]) {
        blocks[blocks.findIndex(item => item.id === block.id)] = { ...block, indent: live.indent };
        continue;
      }
      // Creation may have committed before its receipt was lost. An empty
      // recovered editable must never cover text saved into that durable ID.
      if ((block.type === "heading" || block.type === "paragraph") && isRichTextEmpty(block.text)) continue;
      conflicts.push(block);
    } else if (expected?.[block.id]) {
      // This was an existing block, since removed elsewhere. Do not resurrect it.
      conflicts.push(block);
    } else {
      // Append at the root so an uncertain insertion cannot reparent or move
      // any of the saved page's existing blocks.
      blocks.push({ ...block, indent: 0 });
    }
  }
  return { blocks, conflicts, pending: conflicts.length > 0 || blocks.length !== saved.length || blocks.some((block, index) => !sameBlock(block, saved[index])) };
}
