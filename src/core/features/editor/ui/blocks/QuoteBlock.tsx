import type { BlockRenderProps, QuoteBlockData } from "../types";
import { Editable } from "./Editable";

/** A quoted passage, marked by the left rule the references use. */
export function QuoteBlock({ block, canEdit, onChange }: BlockRenderProps<QuoteBlockData>) {
  return (
    <figure className="py-1">
      <blockquote className="border-l-2 border-ink pl-4">
        <Editable
          canEdit={canEdit}
          className="text-body leading-relaxed text-ink"
          label="Quote"
          onChange={(text) => onChange({ ...block, text })}
          placeholder="Quote"
          value={block.text}
        />
      </blockquote>
      {block.attribution ? (
        <figcaption className="mt-1 pl-4 text-small text-ink-muted">{block.attribution}</figcaption>
      ) : null}
    </figure>
  );
}
