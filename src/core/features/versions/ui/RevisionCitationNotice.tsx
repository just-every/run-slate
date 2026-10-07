import { FileX2, History } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Button } from "../../../ui";

export type RevisionCitationVariant = "newer-revision" | "erased";

export interface RevisionCitationNoticeProps {
  variant: RevisionCitationVariant;
  /** `newer-revision` only: how the opened revision is named, such as "Version 4". */
  revisionLabel?: string;
  /** `newer-revision` only: when the opened revision was committed, written out. */
  capturedAt?: string;
  /** `newer-revision` only: when the newest revision was committed, written out. */
  currentAt?: string;
  onOpenCurrent?: () => void;
}

/**
 * `REV-005` — opening a link, mention or citation that names a revision shows that
 * revision as committed and says that a newer revision exists. Where the page has been
 * erased it opens the content-free tombstone of `LINK-002`, which carries no body, no
 * quote and no personal metadata: no title, no author, no time and no container.
 */
export function RevisionCitationNotice({
  variant,
  revisionLabel,
  capturedAt,
  currentAt,
  onOpenCurrent,
}: RevisionCitationNoticeProps) {
  if (variant === "erased") {
    return (
      <div
        className="flex items-start gap-2 rounded-card border border-line bg-sidebar px-3 py-2.5 text-ui text-ink-muted"
        role="status"
      >
        <FileX2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <p>This {knowledgeNoun("record")} no longer exists.</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-start gap-2 rounded-card border border-warn/30 bg-warn-soft px-3 py-2.5"
      role="status"
    >
      <History aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="text-ui text-ink">
          You are reading {revisionLabel ?? "an earlier revision"}
          {capturedAt ? `, as it was committed on ${capturedAt}` : ""}. A newer revision of this page exists
          {currentAt ? `, committed on ${currentAt}` : ""}.
        </p>
        <p className="text-tiny text-ink-muted">
          The content below is exactly what the citation names, and it does not change when the page changes.
        </p>
      </div>
      {onOpenCurrent ? (
        <Button onClick={onOpenCurrent} size="sm" variant="secondary">
          Open the current revision
        </Button>
      ) : null}
    </div>
  );
}
