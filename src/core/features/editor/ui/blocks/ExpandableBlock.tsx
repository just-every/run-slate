import {useState} from 'react';
import { ChevronRight } from "lucide-react";
import { cn } from "../../../../ui";
import type { BlockRenderProps, ExpandableBlockData } from "../types";
import { Editable, EditableLine } from "./Editable";

/** An expandable section: a summary line that opens onto its content. */
export function ExpandableBlock({ block, canEdit, onChange }: BlockRenderProps<ExpandableBlockData>) {
  const [readerOpen,setReaderOpen]=useState(block.open);
  const open=canEdit?block.open:readerOpen;
  return (
    <section className="my-1 rounded-card border border-line">
      <div className="flex items-start gap-2 p-2">
        <button
          aria-expanded={open}
          className="mt-0.5 rounded-control p-0.5 text-ink-muted transition-colors hover:bg-sidebar-hover hover:text-ink"
          onClick={() => canEdit?onChange({ ...block, open: !open }):setReaderOpen(!open)}
          type="button"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn("size-4 transition-transform", open ? "rotate-90" : "")}
          />
          <span className="sr-only">
            {open ? "Collapse" : "Expand"} {block.summary.length > 0 ? block.summary : "this section"}
          </span>
        </button>
        <EditableLine
          canEdit={canEdit}
          className="text-body font-medium text-ink"
          label="Expandable section summary"
          onTextChange={(summary) => onChange({ ...block, summary })}
          placeholder="Summary"
          value={block.summary}
        />
      </div>
      {open ? (
        <div className="border-t border-line px-3 py-2 pl-9">
          <Editable
            canEdit={canEdit}
            className="text-body leading-relaxed text-ink"
            label="Expandable section content"
            onChange={(text) => onChange({ ...block, content: text })}
            placeholder="What opens when this is expanded"
            value={block.content}
          />
        </div>
      ) : null}
    </section>
  );
}
