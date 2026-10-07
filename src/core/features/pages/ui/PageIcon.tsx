import { FileText } from "lucide-react";
import { cn } from "../../../ui";
import type { PageIconValue } from "./types";

/**
 * `PAGE-006` — a page's icon, stored as emoji or as an uploaded image and never
 * required. Three sizes because the same stored value renders in a tree row, in
 * a search result and over the cover on the page itself. No image file is
 * referenced from here: an image icon arrives as a stored URL on the prop.
 */
export type PageIconSize = "row" | "result" | "header";

const boxClass: Record<PageIconSize, string> = {
  row: "size-4 text-[0.8125rem] leading-none",
  result: "size-6 text-[1.125rem] leading-none",
  header: "size-16 text-[3.25rem] leading-none",
};

const glyphClass: Record<PageIconSize, string> = {
  row: "size-4",
  result: "size-5",
  header: "size-12",
};

const imageRadius: Record<PageIconSize, string> = {
  row: "rounded-[0.1875rem]",
  result: "rounded-control",
  header: "rounded-card",
};

export function PageIcon({
  icon,
  size = "row",
  /** Show a neutral page glyph when the page carries no icon. */
  fallback = false,
  className,
}: {
  icon: PageIconValue;
  size?: PageIconSize;
  fallback?: boolean;
  className?: string;
}) {
  const box = cn("inline-flex shrink-0 select-none items-center justify-center", boxClass[size], className);

  if (icon === null) {
    if (!fallback) return null;
    return (
      <span className={box}>
        <FileText aria-hidden="true" className={cn(glyphClass[size], "text-ink-faint")} />
      </span>
    );
  }

  if (icon.kind === "image") {
    return (
      <img
        alt=""
        className={cn(box, "object-cover", imageRadius[size])}
        src={icon.url}
      />
    );
  }

  return (
    <span aria-hidden="true" className={box}>
      {icon.emoji}
    </span>
  );
}
