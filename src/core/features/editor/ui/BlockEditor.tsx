import { useRef, useState, type ReactNode } from "react";
import { DeniedState, ErrorState, LoadingState, cn, type SurfaceState } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { BlockRow } from "./BlockRow";
import { Editable } from "./blocks/Editable";
import { richTextToPlain } from "./types";
import type { BlockActions, BlockMove, BlockSaveState, ConflictChoice, EditorBlock } from "./types";

export interface BlockEditorProps {
  state?: SurfaceState;
  blocks: EditorBlock[];
  canEdit: boolean;
  /** `SAVE-003` catches conflicts at block grain, so save state is per block. */
  saveState?: Record<string, BlockSaveState>;
  actions?: BlockActions;
  selectedBlockIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onChange: (blockId: string, next: EditorBlock) => void;
  /** Null inserts at the top of the body. */
  onInsert: (afterBlockId: string | null) => void;
  onDelete: (blockId: string) => void;
  onMove: (blockId: string, move: BlockMove) => void;
  onDuplicate: (blockId: string) => void;
  onRetrySave?: (blockId: string) => void;
  onResolveConflict?: (blockId: string, choice: ConflictChoice) => void;
  /** The first characters typed into an empty body. */
  onStartWriting?: (text: string) => void;
  placeholder?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  /** Slots under the last block: the page-level save state, an insert bar. */
  footer?: ReactNode;
  className?: string;
}

function Column({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex w-full justify-center gap-1">
      <div aria-hidden="true" className="w-12 shrink-0" />
      <div className={cn("w-full max-w-reading min-w-0", className)}>{children}</div>
    </div>
  );
}

/**
 * The page body (`BLOCK-001`): an ordered list of blocks in a reading column,
 * each with a gutter handle and an insert button, selectable across neighbours,
 * and each carrying its own save state.
 */
export function BlockEditor({
  state = "ready",
  blocks,
  canEdit,
  saveState,
  actions,
  selectedBlockIds = [],
  onSelectionChange,
  onChange,
  onInsert,
  onDelete,
  onMove,
  onDuplicate,
  onRetrySave,
  onResolveConflict,
  onStartWriting,
  placeholder = "Write something, or press / for blocks",
  errorMessage,
  onRetry,
  onRequestAccess,
  footer,
  className,
}: BlockEditorProps) {
  const anchorId = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const select = (blockId: string, extend: boolean) => {
    if (!onSelectionChange) return;
    if (!extend || !anchorId.current) {
      anchorId.current = blockId;
      onSelectionChange([blockId]);
      return;
    }
    const from = blocks.findIndex((block) => block.id === anchorId.current);
    const to = blocks.findIndex((block) => block.id === blockId);
    if (from < 0 || to < 0) return;
    const [start, end] = from <= to ? [from, to] : [to, from];
    onSelectionChange(blocks.slice(start, end + 1).map((block) => block.id));
  };

  const dropOn = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const from = blocks.findIndex((block) => block.id === draggingId);
    const to = blocks.findIndex((block) => block.id === targetId);
    setDraggingId(null);
    if (from < 0 || to < 0) return;
    onMove(draggingId, from < to ? { kind: "after", blockId: targetId } : { kind: "before", blockId: targetId });
  };

  const frame = (children: ReactNode) => (
    <div className={cn("mx-auto w-full max-w-wide px-3 py-4 sm:px-6", className)}>{children}</div>
  );

  if (state === "loading") {
    return frame(
      <Column>
        <LoadingState rows={6} />
      </Column>,
    );
  }

  if (state === "denied") {
    return frame(
      <Column>
        <DeniedState onRequestAccess={onRequestAccess} />
      </Column>,
    );
  }

  if (state === "error") {
    return frame(
      <Column>
        <ErrorState
          detail={errorMessage}
          onRetry={onRetry}
          title={`This ${knowledgeNoun("pageBody")} could not be loaded`}
        />
      </Column>,
    );
  }

  if (state === "empty" || blocks.length === 0) {
    return frame(
      <Column className="px-1">
        <Editable
          canEdit={canEdit}
          className="text-body leading-relaxed text-ink"
          label={knowledgeNoun("pageBody")}
          onChange={(text) => onStartWriting?.(richTextToPlain(text))}
          placeholder={placeholder}
          value={[]}
        />
      </Column>,
    );
  }

  return frame(
    <div className="flex flex-col">
      {blocks.map((block) => (
        <BlockRow
          actions={actions}
          block={block}
          canEdit={canEdit}
          key={block.id}
          onChange={(next) => onChange(block.id, next)}
          onDelete={() => onDelete(block.id)}
          onDragEnd={() => setDraggingId(null)}
          onDragStart={() => setDraggingId(block.id)}
          onDropHere={() => dropOn(block.id)}
          onDuplicate={() => onDuplicate(block.id)}
          onInsert={() => onInsert(block.id)}
          onMove={(move) => onMove(block.id, move)}
          onResolveConflict={(choice) => onResolveConflict?.(block.id, choice)}
          onRetrySave={() => onRetrySave?.(block.id)}
          onSelect={onSelectionChange ? ({ extend }) => select(block.id, extend) : undefined}
          placeholder={placeholder}
          saveState={saveState?.[block.id]}
          selected={selectedBlockIds.includes(block.id)}
        />
      ))}
      {footer ? <Column className="pt-3">{footer}</Column> : null}
    </div>,
  );
}
