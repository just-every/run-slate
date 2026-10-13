import type { MouseEvent } from "react";
import { cn } from "../../../ui";
import { BlockConflictBadge } from "./BlockConflictBadge";
import { BlockHandle } from "./BlockHandle";
import { SaveStatus } from "./SaveStatus";
import { BlockView } from "./blocks/BlockView";
import {
  richTextToPlain,
  type BlockActions,
  type BlockMove,
  type BlockSaveState,
  type ConflictChoice,
  type EditorBlock,
} from "./types";

const indentClass: Record<number, string> = {
  0: "",
  1: "pl-6",
  2: "pl-12",
  3: "pl-16",
};

export function describeBlock(block: EditorBlock): string {
  switch (block.type) {
    case "paragraph":
    case "quote":
    case "callout":
    case "task":
      return richTextToPlain(block.text).slice(0, 40) || `empty ${block.type} block`;
    case "heading":
      return richTextToPlain(block.text).slice(0, 40) || "empty heading";
    case "list":
      return `${block.variant} list`;
    case "divider":
      return "divider";
    case "expandable":
      return block.summary || "expandable section";
    case "table":
      return "table";
    case "code":
      return `${block.language} code block`;
    case "media":
      return `${block.kind} block`;
    case "link-card":
      return "link card";
    case "content-query":
      return "content query";
  }
}

export interface BlockRowProps {
  block: EditorBlock;
  canEdit: boolean;
  selected?: boolean;
  saveState?: BlockSaveState;
  actions?: BlockActions;
  placeholder?: string;
  onChange: (next: EditorBlock) => void;
  onInsert: (anchor: HTMLElement) => void;
  onMove: (move: BlockMove) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Selecting a block, and extending the selection across its neighbours. */
  onSelect?: (options: { extend: boolean }) => void;
  onRetrySave?: () => void;
  onResolveConflict?: (choice: ConflictChoice) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDropHere?: () => void;
}

/** One row of the body: the gutter, the block, and the block's own save state. */
export function BlockRow({
  block,
  canEdit,
  selected = false,
  saveState,
  actions,
  placeholder,
  onChange,
  onInsert,
  onMove,
  onDuplicate,
  onDelete,
  onSelect,
  onRetrySave,
  onResolveConflict,
  onDragStart,
  onDragEnd,
  onDropHere,
}: BlockRowProps) {
  const label = describeBlock(block);
  const status = saveState?.status ?? "idle";

  return (
    <div
      className="block-row group/row flex w-full justify-center gap-1"
      data-block-id={block.id}
      data-selected={selected ? "true" : undefined}
      onDragOver={onDropHere ? (event) => event.preventDefault() : undefined}
      onDrop={
        onDropHere
          ? (event) => {
              event.preventDefault();
              onDropHere();
            }
          : undefined
      }
    >
      <BlockHandle
        blockLabel={label}
        canEdit={canEdit}
        onDelete={onDelete}
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
        onDuplicate={onDuplicate}
        onInsert={onInsert}
        onMove={onMove}
      />

      <div
        className={cn(
          "block-content w-full max-w-reading min-w-0 rounded-card px-1",
          indentClass[Math.min(block.indent ?? 0, 3)],
          selected ? "bg-accent-soft ring-1 ring-accent/40" : "",
        )}
        onClick={
          onSelect
            ? (event: MouseEvent<HTMLDivElement>) => onSelect({ extend: event.shiftKey })
            : undefined
        }
      >
        {selected ? <span className="sr-only">Selected with its neighbours.</span> : null}

        <BlockView
          actions={actions}
          block={block}
          canEdit={canEdit}
          onChange={onChange}
          placeholder={placeholder}
        />

        {status === "conflict" && saveState?.status === "conflict" ? (
          <BlockConflictBadge
            className="mt-1"
            conflict={saveState.conflict}
            onChoose={(choice) => onResolveConflict?.(choice)}
          />
        ) : null}

        {status === "failed" && saveState?.status === "failed" ? (
          <SaveStatus
            className="mt-1"
            failureMessage={saveState.message}
            onRetry={onRetrySave}
            state="failed"
          />
        ) : null}

        {status === "saving" ? <SaveStatus className="mt-1" state="saving" /> : null}

        {status === "offline" ? <SaveStatus className="mt-1" state="offline" onRetry={onRetrySave} /> : null}

        {status === "unsaved" ? <SaveStatus className="mt-1" state="unsaved" onRetry={onRetrySave} /> : null}

        {status === "saved" && saveState?.status === "saved" ? (
          <SaveStatus className="mt-1" savedAtLabel={saveState.atLabel} state="saved" />
        ) : null}
      </div>
    </div>
  );
}
