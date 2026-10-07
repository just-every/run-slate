import { BadgeCheck, Clock3 } from "lucide-react";
import { cn } from "../../../ui";
import { statusColourClass } from "./status-colours";
import type { StatusColourKey } from "./types";

export interface StatusChipProps {
  label: string;
  /** The colour stored on the vocabulary entry (`STAT-001`). */
  colour: StatusColourKey;
  /**
   * `STAT-005`: `breadcrumb` is where `verification-only` puts the chip, beside the
   * breadcrumb title; `byline` is where `open-vocabulary` puts it, between the author
   * and the reading time.
   */
  placement: "breadcrumb" | "byline";
  /** A verified status that is still current. */
  verified?: boolean;
  /** A verification whose expiry has passed (`STAT-004`). */
  lapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

/** The page's status as a chip. `STAT-002` — a page carries at most one. */
export function StatusChip({
  label,
  colour,
  placement,
  verified = false,
  lapsed = false,
  onClick,
  className,
}: StatusChipProps) {
  const suffix = lapsed ? " (lapsed)" : "";
  const content = (
    <>
      {verified && !lapsed ? (
        <BadgeCheck aria-hidden="true" className="size-3.5 text-good" />
      ) : lapsed ? (
        <Clock3 aria-hidden="true" className="size-3.5 text-warn" />
      ) : (
        <span aria-hidden="true" className={cn("size-2 rounded-full", statusColourClass[colour])} />
      )}
      <span>
        {label}
        {suffix}
      </span>
    </>
  );

  const shape = cn(
    "inline-flex items-center gap-1.5 rounded-control font-medium whitespace-nowrap",
    placement === "breadcrumb"
      ? "px-1.5 py-0.5 text-tiny text-ink"
      : "px-1.5 py-0.5 text-micro text-ink-muted",
    lapsed ? "bg-warn-soft text-warn" : placement === "breadcrumb" ? "bg-sidebar-hover" : "bg-transparent",
    className,
  );

  if (!onClick) {
    return <span className={shape}>{content}</span>;
  }

  return (
    <button className={cn(shape, "hover:bg-sidebar-hover")} onClick={onClick} type="button">
      {content}
    </button>
  );
}
