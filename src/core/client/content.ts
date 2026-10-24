import type { PageDocument, BlockView, PageRef } from "../shared/api/content";
import type { MutationReceipt, PageResult } from "../shared/api/common";
import type { EditorBlock } from "../features/editor/ui/types";
import { mutate, operationKey, request } from "./transport";

export interface PageProperties {
  title?: string;
  icon?: unknown;
  coverFileId?: string | null;
  labels?: string[];
  typeface?: string;
  smallText?: boolean;
  fullWidth?: boolean;
}
export type DocumentView = PageDocument & { properties?: PageProperties; parentPageId?: string | null };
export type ContentReceipt = {
  value: { pageId: string; revisionId: string; blockRevisionId?: string; previousRevisionId?: string };
  receipt: MutationReceipt;
};

export function editorBlocks(blocks: BlockView[]): EditorBlock[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  return blocks.map((block) => {
    if (
      !block.content ||
      Array.isArray(block.content) ||
      typeof block.content !== "object"
    )
      throw new Error(
        "This block has unreadable content. Its stored value has not been changed.",
      );
    let indent = 0, layoutParentId: string | undefined;
    let parent = block.parentBlockId;
    const visited = new Set([block.id]);
    while (parent && byId.has(parent)) {
      if (visited.has(parent)) throw new Error("This page contains a circular block hierarchy.");
      visited.add(parent);
      const ancestor=byId.get(parent)!;
      if (["columns","column"].includes(ancestor.blockType)){layoutParentId=parent;break;}
      indent++;
      parent=ancestor.parentBlockId;
    }
    return {
      ...block.content,
      id: block.id,
      type: block.blockType,
      indent,
      layoutParentId,
      synced:block.synced,
      copyRevisionId:block.revisionId,
    } as EditorBlock;
  });
}

export function storedBlocks(blocks: EditorBlock[]) {
  const ancestors: string[] = [];
  return blocks.map((block, index) => {
    const { id, type: blockType, indent = 0, layoutParentId, synced:_synced, copyRevisionId:_copyRevisionId, ...content } = block;
    const depth = Math.min(indent, ancestors.length);
    const parentBlockId = depth > 0 ? ancestors[depth - 1] : layoutParentId ?? null;
    ancestors.length = depth;
    ancestors.push(id);
    return {
      id,
      blockType,
      content,
      parentBlockId,
      treePosition: String(index).padStart(8, "0"),
    };
  });
}

export const contentApi = {
  lock: (id: string, expectedRevisionId: string, locked: boolean) =>
    mutate<ContentReceipt>(`/api/pages/${encodeURIComponent(id)}/${locked ? "lock" : "unlock"}`, { operationKey: operationKey(), expectedRevisionId }),
  list: (containerId?: string) =>
    request<PageResult<PageRef>>(
      `/api/pages${containerId ? `?containerId=${encodeURIComponent(containerId)}` : ""}`,
    ),
  document: (id: string, signal?: AbortSignal) =>
    request<DocumentView>(`/api/pages/${encodeURIComponent(id)}`, { signal }),
  create: (containerId: string, title: string, parentPageId?: string) =>
    mutate<ContentReceipt>("/api/pages", {
      operationKey: operationKey(),
      containerId,
      title,
      parentPageId,
    }),
  properties: (
    id: string,
    expectedRevisionId: string,
    properties: PageProperties,
  ) =>
    mutate<ContentReceipt>(
      `/api/pages/${encodeURIComponent(id)}`,
      { operationKey: operationKey(), expectedRevisionId, properties },
      "PATCH",
    ),
  block: (
    pageId: string,
    block: EditorBlock,
    expectedRevisionId: string,
    key: string,
  ) => {
    const { id, type: _type, indent: _indent, layoutParentId: _layoutParentId, synced:_synced, copyRevisionId:_copyRevisionId, ...content } = block;
    return mutate<ContentReceipt>(
      `/api/pages/${encodeURIComponent(pageId)}/blocks/${encodeURIComponent(id)}`,
      { operationKey: key, expectedRevisionId, content },
      "PATCH",
    );
  },
  structure: (id: string, expectedRevisionId: string, blocks: EditorBlock[], blockRevisions: Record<string, string>, key = operationKey()) =>
    mutate<ContentReceipt & {value: {blocks: BlockView[]}}>(
      `/api/pages/${encodeURIComponent(id)}/blocks`,
      {
        operationKey: key,
        expectedRevisionId,
        blocks: storedBlocks(blocks),
        blockRevisions,
      },
      "PUT",
    ),
};
