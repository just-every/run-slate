import { cn } from "../../../../ui";
import type { BlockRenderProps, HeadingBlockData } from "../types";
import { Editable } from "./Editable";

const levelClass: Record<1 | 2 | 3, string> = {
  1: "text-h1 font-semibold",
  2: "text-h2 font-semibold",
  3: "text-h3 font-semibold",
};

/** A section heading. The level is the author's; the tag follows it. */
export function HeadingBlock({ block, canEdit, onChange }: BlockRenderProps<HeadingBlockData>) {
  const tag = (["h2", "h3", "h4"] as const)[block.level - 1];
  return (
    <div className={cn("flex items-baseline gap-2 pt-6 pb-1", levelClass[block.level])}>
      {block.number ? <span className="shrink-0 text-ink">{block.number}.</span> : null}
      <Editable
        as={tag}
        canEdit={canEdit}
        className="text-ink"
        label={`Heading level ${block.level}`}
        multiline={false}
        onChange={(text) => onChange({ ...block, text })}
        placeholder="Heading"
        value={block.text}
      />
    </div>
  );
}
