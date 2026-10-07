import { Archive, CircleDot, Clock, PencilLine, UploadCloud } from "lucide-react";
import type { ComponentType } from "react";
import type { PageLifecycle } from "../../../shared/knowledge/model";
import { Badge, cn } from "../../../ui";

type ChipTone = "draft" | "warn" | "good" | "accent" | "neutral";

const chips: Record<PageLifecycle, { label: string; tone: ChipTone; Icon: ComponentType<{ className?: string }> }> = {
  draft: { label: "Draft", tone: "draft", Icon: PencilLine },
  scheduled: { label: "Scheduled", tone: "warn", Icon: Clock },
  live: { label: "Live", tone: "good", Icon: CircleDot },
  "live-with-unpublished-changes": { label: "Unpublished changes", tone: "accent", Icon: UploadCloud },
  archived: { label: "Archived", tone: "neutral", Icon: Archive },
};

/**
 * The five lifecycle states of `LIFE-001` as one chip. The label always carries the
 * meaning; the tone and the icon only reinforce it.
 */
export function LifecycleChip({
  state,
  className,
  detail,
}: {
  state: PageLifecycle;
  /** An extra clause shown after the label, such as the scheduled time. */
  detail?: string;
  className?: string;
}) {
  const chip = chips[state];
  return (
    <Badge className={cn("gap-1", className)} tone={chip.tone}>
      <chip.Icon aria-hidden="true" className="size-3" />
      {chip.label}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </Badge>
  );
}
