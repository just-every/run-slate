import {useState} from 'react';
import { ChevronRight } from "lucide-react";
import { cn } from "../../../../ui";
import type { BlockRenderProps, ListBlockData, ListItemData } from "../types";
import { Editable } from "./Editable";

function replaceItem(block: ListBlockData, item: ListItemData): ListBlockData {
  return { ...block, items: block.items.map((current) => (current.id === item.id ? item : current)) };
}

function ToggleItem({
  item,
  canEdit,
  onChange,
}: {
  item: ListItemData;
  canEdit: boolean;
  onChange: (next: ListItemData) => void;
}) {
  const [readerOpen,setReaderOpen]=useState(item.open??false);
  const open = canEdit?(item.open ?? false):readerOpen;
  return (
    <li className="text-body leading-relaxed text-ink">
      <div className="flex items-start gap-1">
        <button
          aria-expanded={open}
          className="mt-1 rounded-control p-0.5 text-ink-muted transition-colors hover:bg-sidebar-hover hover:text-ink"
          onClick={() => canEdit?onChange({ ...item, open: !open }):setReaderOpen(!open)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className={cn("size-4 transition-transform", open ? "rotate-90" : "")} />
          <span className="sr-only">{open ? "Collapse" : "Expand"} this item</span>
        </button>
        <Editable
          canEdit={canEdit}
          label="Toggle item"
          onChange={(text) => onChange({ ...item, text })}
          placeholder="Toggle"
          value={item.text}
        />
      </div>
      {open ? (
        <div className="mt-1 pl-6">
          <Editable
            canEdit={canEdit}
            className="text-body text-ink-muted"
            label="Toggle item content"
            onChange={(text) => onChange({ ...item, detail: text })}
            placeholder="Empty toggle. Write inside it."
            value={item.detail ?? []}
          />
        </div>
      ) : null}
    </li>
  );
}

/** Bulleted, numbered and toggle lists (`BLOCK-006`). */
export function ListBlock({ block, canEdit, onChange }: BlockRenderProps<ListBlockData>) {
  if (block.variant === "toggle") {
    return (
      <ul className="flex list-none flex-col gap-1 py-0.5">
        {block.items.map((item) => (
          <ToggleItem
            canEdit={canEdit}
            item={item}
            key={item.id}
            onChange={(next) => onChange(replaceItem(block, next))}
          />
        ))}
      </ul>
    );
  }

  const ordered = block.variant === "numbered";
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "flex flex-col gap-1 py-0.5 pl-6 text-body leading-relaxed text-ink",
        ordered ? "list-decimal" : "list-disc",
      )}
      start={ordered ? block.start : undefined}
    >
      {block.items.map((item) => (
        <li className="pl-1 marker:text-ink-muted" key={item.id}>
          <Editable
            canEdit={canEdit}
            label={ordered ? "Numbered list item" : "Bulleted list item"}
            onChange={(text) => onChange(replaceItem(block, { ...item, text }))}
            placeholder="List item"
            value={item.text}
          />
        </li>
      ))}
    </Tag>
  );
}
