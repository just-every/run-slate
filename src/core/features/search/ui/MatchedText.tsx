import { cn } from "../../../ui";
import type { MatchSegment } from "./types";

/**
 * `SEARCH-002` — the matched text in context. The match is carried by `<mark>`,
 * which screen readers and plain-text copies keep, with a token highlight behind
 * it; the surrounding text stays plain, so nothing is told by colour alone.
 */
export function MatchedText({
  segments,
  className,
  markClassName,
}: {
  segments: readonly MatchSegment[];
  className?: string;
  markClassName?: string;
}) {
  if (segments.length === 0) return null;
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark className={cn("bg-hl-yellow font-medium text-ink", markClassName)} key={index}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

/** The plain string behind a run of segments, for a title attribute or a label. */
export function matchedPlainText(segments: readonly MatchSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}
