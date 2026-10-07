import { Checkbox, cn } from "../../../../ui";
import { richTextToPlain, type BlockRenderProps, type TaskBlockData } from "../types";
import { Editable } from "./Editable";

/**
 * `BLOCK-007` — a checkable item in the body. Anyone with edit access may toggle
 * it, and the row shows who completed it and when.
 */
export function TaskBlock({ block, canEdit, onChange }: BlockRenderProps<TaskBlockData>) {
  const plain = richTextToPlain(block.text);
  const completion =
    block.done && (block.completedBy || block.completedAtLabel)
      ? [block.completedBy ? `Completed by ${block.completedBy.name}` : "Completed", block.completedAtLabel]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <div className="flex items-start gap-2 py-0.5">
      <Checkbox
        aria-label={plain.length > 0 ? `Mark complete: ${plain}` : "Mark this to-do complete"}
        checked={block.done}
        className="mt-1"
        disabled={!canEdit}
        onCheckedChange={(checked) => onChange({ ...block, done: checked === true })}
      />
      <div className="flex-1">
        <Editable
          canEdit={canEdit}
          className={cn("text-body leading-relaxed", block.done ? "text-ink-muted line-through" : "text-ink")}
          label="To-do item"
          onChange={(text) => onChange({ ...block, text })}
          placeholder="To-do"
          value={block.text}
        />
        {completion ? <p className="text-tiny text-ink-faint">{completion}</p> : null}
      </div>
    </div>
  );
}
