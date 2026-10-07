import type { BlockRenderProps, ParagraphBlockData } from "../types";
import { Editable } from "./Editable";

/** `BLOCK-002` — a run of inline text in the reading column. */
export function ParagraphBlock({
  block,
  canEdit,
  onChange,
  placeholder = "Write something, or press / for blocks",
}: BlockRenderProps<ParagraphBlockData> & { placeholder?: string }) {
  return (
    <Editable
      canEdit={canEdit}
      className="py-0.5 text-body leading-relaxed text-ink"
      label="Paragraph"
      onChange={(text) => onChange({ ...block, text })}
      placeholder={placeholder}
      value={block.text}
    />
  );
}
