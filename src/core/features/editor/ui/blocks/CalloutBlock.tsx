import { cn } from "../../../../ui";
import type { BlockRenderProps, CalloutBlockData, CalloutTone } from "../types";
import { Editable } from "./Editable";

const toneClass: Record<CalloutTone, string> = {
  neutral: "border-line bg-sidebar",
  accent: "border-accent/30 bg-accent-soft",
  good: "border-good/30 bg-good-soft",
  warn: "border-warn/30 bg-warn-soft",
  danger: "border-danger/30 bg-danger-soft",
};

const toneLabel: Record<CalloutTone, string> = {
  neutral: "Note",
  accent: "Information",
  good: "Success",
  warn: "Caution",
  danger: "Warning",
};

/** A panel that stands out from the prose around it (`BLOCK-006`). */
export function CalloutBlock({ block, canEdit, onChange }: BlockRenderProps<CalloutBlockData>) {
  return (
    <aside
      aria-label={`${toneLabel[block.tone]} callout`}
      className={cn("my-1 flex items-start gap-3 rounded-card border p-3", toneClass[block.tone])}
    >
      <span aria-hidden="true" className="text-body leading-relaxed">
        {block.icon ?? "•"}
      </span>
      <span className="sr-only">{toneLabel[block.tone]}:</span>
      <Editable
        canEdit={canEdit}
        className="text-body leading-relaxed text-ink"
        label="Callout text"
        onChange={(text) => onChange({ ...block, text })}
        placeholder="Write a callout"
        value={block.text}
      />
    </aside>
  );
}
