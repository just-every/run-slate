import { ShieldAlert } from "lucide-react";
import { Button, cn } from "../../../ui";

export interface RestrictionNoticeProps {
  /**
   * `SHARE-003` — a restriction is shown on the page it was set on and on every
   * descendant it affects.
   */
  scope: "this-page" | "descendant";
  /** Where the restriction was set: this page's title under `descendant`. */
  restrictedAt: string;
  /** What the page inherits from when inheritance is restored. */
  inheritsFrom: string;
  /** A plain summary of who can still open it, worked out by the caller. */
  summary?: string | null;
  canRestoreInheritance: boolean;
  onRestoreInheritance: () => void;
  onOpenRestrictedPage?: () => void;
  className?: string;
}

export function RestrictionNotice({
  scope,
  restrictedAt,
  inheritsFrom,
  summary = null,
  canRestoreInheritance,
  onRestoreInheritance,
  onOpenRestrictedPage,
  className,
}: RestrictionNoticeProps) {
  return (
    <div
      className={cn("flex items-start gap-2 rounded-card border border-line bg-sidebar p-3", className)}
      role="status"
    >
      <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-ui font-medium text-ink">
          {scope === "this-page" ? "Access here is restricted" : `Restricted by “${restrictedAt}”`}
        </p>
        <p className="text-tiny text-ink-muted">
          {scope === "this-page"
            ? `This page stopped inheriting grants from ${inheritsFrom}. Only the grants listed here apply, and every page beneath it is restricted too.`
            : `This page sits under “${restrictedAt}”, which no longer inherits grants from ${inheritsFrom}. Its restriction applies here as well.`}
        </p>
        {summary ? <p className="text-tiny text-ink-muted">{summary}</p> : null}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {canRestoreInheritance ? (
            <Button onClick={onRestoreInheritance} size="sm" variant="secondary">
              Restore inheritance
            </Button>
          ) : null}
          {scope === "descendant" && onOpenRestrictedPage ? (
            <Button onClick={onOpenRestrictedPage} size="sm" variant="ghost">
              Open “{restrictedAt}”
            </Button>
          ) : null}
        </div>
        {canRestoreInheritance ? (
          <p className="text-tiny text-ink-faint">
            Restoring inheritance brings back {inheritsFrom}&rsquo;s grants as they are now; it does not copy them
            onto this page.
          </p>
        ) : null}
      </div>
    </div>
  );
}
