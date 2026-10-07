import { Info } from "lucide-react";
import { Button, cn } from "../../../ui";
import { recordNoun, sentenceCase } from "./nouns";

/**
 * `SEARCH-009` — the one line that says what the default leaves out. Archived and
 * trashed records are excluded until the filter is applied; nothing else the
 * searching member may read is hidden, and every excluded record stays reachable
 * through its links, mentions and citations.
 */
export function DefaultVisibilityNote({
  onIncludeHidden,
  className,
}: {
  /** Applies the archived and trashed filter. Omit it where there is nowhere to apply it. */
  onIncludeHidden?: () => void;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-card bg-sidebar px-3 py-2 text-tiny text-ink-muted",
        className,
      )}
    >
      <Info aria-hidden="true" className="size-3.5 shrink-0 text-ink-faint" />
      <span>
        {`${sentenceCase(recordNoun)}s that are archived or in the trash are left out until you ask for them. Nothing else you may read is hidden, and they stay reachable through every link, mention and citation.`}
      </span>
      {onIncludeHidden ? (
        <Button className="h-6 px-1 text-tiny font-normal" onClick={onIncludeHidden} variant="link">
          Include them
        </Button>
      ) : null}
    </p>
  );
}
