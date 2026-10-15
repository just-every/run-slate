import { contentApi, editorBlocks, type ContentReceipt } from './content';
import type { PendingEdit } from './draftRecovery';
import { ApiError } from './transport';

/** Change one block's kind without writing this tab's stale copies of its neighbours. */
export async function saveBlockType(pageId: string, edit: PendingEdit, persist: () => void): Promise<ContentReceipt> {
  if (!edit.structure) {
    const fresh = await contentApi.document(pageId);
    const stored = fresh.blocks.find(block => block.id === edit.block.id);
    if (!stored) throw new ApiError(404, 'NOT_FOUND', 'This block was removed. Your unsaved content remains here.');
    if (stored.revisionId !== edit.revision)
      throw new ApiError(409, 'BLOCK_CONFLICT', 'This block changed. Keep your unsaved text and compare.');
    edit.structure = {
      revision: fresh.page.revisionId,
      blocks: editorBlocks(fresh.blocks).map(block => block.id === edit.block.id ? {...edit.block, indent:block.indent} : block),
      blockRevisions: Object.fromEntries(fresh.blocks.map(block => [block.id, block.revisionId])),
    };
    persist();
  }
  const plan = edit.structure;
  const result = await contentApi.structure(pageId, plan.revision, plan.blocks, plan.blockRevisions, edit.key);
  const saved = result.value.blocks.find(block => block.id === edit.block.id);
  if (!saved) throw new Error('The server did not confirm the converted block. Your draft remains here.');
  return {...result, value:{...result.value, blockRevisionId:saved.revisionId, previousRevisionId:plan.revision}};
}
