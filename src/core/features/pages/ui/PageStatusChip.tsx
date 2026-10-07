import { BadgeCheck } from "lucide-react";
import { cn } from "../../../ui";
import { knowledgeColourClass, type PageStatusEntry } from "./types";

/**
 * The status chip `STAT-005` places in two different spots. `verification-only`
 * renders the verified entries alone and drops the stored colour; the chip then
 * sits beside the breadcrumb title. `open-vocabulary` keeps the stored colour
 * and the chip rides on the byline.
 *
 * Nothing here conveys meaning by colour alone — the label is always present and
 * a verified entry additionally carries its glyph.
 */
export function PageStatusChip({
  status,
  statusProfile,
  onSelect,
  className,
}: {
  status: PageStatusEntry | null;
  statusProfile: "verification-only" | "open-vocabulary";
  /** Given, the chip becomes the control that opens the status picker. */
  onSelect?: () => void;
  className?: string;
}) {
  if (status === null) return null;
  if (statusProfile === "verification-only" && !status.requiresVerification) return null;

  const verified = status.requiresVerification;
  const tone =
    statusProfile === "verification-only"
      ? verified
        ? "bg-accent-soft text-accent"
        : "bg-sidebar-hover text-ink-muted"
      : knowledgeColourClass[status.colour];

  const body = (
    <>
      {verified ? <BadgeCheck aria-hidden="true" className="size-3.5" /> : null}
      {status.label}
    </>
  );

  const shape = cn(
    "inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-micro leading-4 font-medium",
    tone,
    className,
  );

  if (!onSelect) {
    return <span className={shape}>{body}</span>;
  }

  return (
    <button aria-label={`Status: ${status.label}. Change status`} className={cn(shape, "hover:opacity-80")} onClick={onSelect} type="button">
      {body}
    </button>
  );
}
