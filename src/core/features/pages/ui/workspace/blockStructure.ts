import { storedBlocks } from '../../../../client/content';
import type { BlockMove, EditorBlock } from '../../../editor/ui/types';

/** Include ordinary descendants as well as structural column children. */
export function subtreeIds(blocks: EditorBlock[], id: string): Set<string> {
  const tree = storedBlocks(blocks), parents = new Map(tree.map(block => [block.id, block.parentBlockId]));
  return new Set(tree.filter(block => {
    let current: string | null = block.id;
    while (current) {
      if (current === id) return true;
      current = parents.get(current) ?? null;
    }
    return false;
  }).map(block => block.id));
}

/** Move a complete branch, keeping its depth relative to its new parent. */
export function moveBlockTree(blocks: EditorBlock[], id: string, movement: BlockMove): EditorBlock[] {
  const source = blocks.find(block => block.id === id);
  if (!source || source.type === 'column') return blocks;
  const tree = storedBlocks(blocks), sourceNode = tree.find(block => block.id === id)!;
  const ids = subtreeIds(blocks, id), branch = blocks.filter(block => ids.has(block.id));
  const remaining = blocks.filter(block => !ids.has(block.id));
  let indent = source.indent ?? 0, layoutParentId = source.layoutParentId;
  let at = blocks.findIndex(block => block.id === id);
  const afterBranch = (targetId: string) => {
    const targetIds = subtreeIds(remaining, targetId);
    return remaining.reduce((end, block, index) => targetIds.has(block.id) ? index + 1 : end, 0);
  };
  if (movement.kind === 'indent') {
    const previous = tree.slice(0, at).findLast(block => block.parentBlockId === sourceNode.parentBlockId);
    if (!previous || ['columns', 'synced-source', 'synced-reference'].includes(previous.blockType)) return blocks;
    indent++;
  } else if (movement.kind === 'outdent') {
    if (indent === 0 || !sourceNode.parentBlockId) return blocks;
    indent--;
    at = afterBranch(sourceNode.parentBlockId);
  } else if (movement.kind === 'into-column') {
    const column = blocks.find(block => block.id === movement.columnId);
    if (source.type === 'columns' || column?.type !== 'column' || ids.has(column.id)) return blocks;
    indent = 0;
    layoutParentId = column.id;
    at = afterBranch(column.id);
  } else {
    let targetId: string, after: boolean;
    if (movement.kind === 'step') {
      const siblings = tree.filter(block => block.parentBlockId === sourceNode.parentBlockId);
      const index = siblings.findIndex(block => block.id === id);
      const target = siblings[index + (movement.direction === 'up' ? -1 : 1)];
      if (!target) return blocks;
      targetId = target.id;
      after = movement.direction === 'down';
    } else {
      targetId = movement.blockId;
      after = movement.kind === 'after';
    }
    const target = remaining.find(block => block.id === targetId);
    if (!target || (source.type === 'columns' && target.layoutParentId)) return blocks;
    indent = target.indent ?? 0;
    layoutParentId = target.layoutParentId;
    at = after ? afterBranch(targetId) : remaining.findIndex(block => block.id === targetId);
  }
  const delta = indent - (source.indent ?? 0);
  const moved = branch.map(block => block.layoutParentId === source.layoutParentId
    ? { ...block, indent: (block.indent ?? 0) + delta, layoutParentId }
    : block);
  remaining.splice(at, 0, ...moved);
  return remaining;
}

/** A copy has no claim on a discussion anchored to the retained source. */
export function withoutCommentAnchors<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutCommentAnchors) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'commentAnchorId')
    .map(([key, item]) => [key, withoutCommentAnchors(item)])) as T;
  return value;
}
