import { Lock } from "lucide-react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import { Button, Textarea, cn } from "../../../ui";
import { accessLevelLabel } from "./AccessLevelSelect";

export interface AccessRevokedNoticeProps {
  pageTitle: string;
  /**
   * `SHARE-007` — the level the writer has now, or `null` when the page closed
   * to them entirely.
   */
  levelNow: AccessLevel | null;
  /** The text that was in the editor and was kept, not discarded. */
  unsavedText?: string | null;
  onCopyUnsavedText?: () => void;
  onRequestAccess?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function AccessRevokedNotice({
  pageTitle,
  levelNow,
  unsavedText = null,
  onCopyUnsavedText,
  onRequestAccess,
  onDismiss,
  className,
}: AccessRevokedNoticeProps) {
  return (
    <div
      className={cn("flex w-full max-w-reading flex-col gap-3 rounded-card border border-line bg-surface p-4", className)}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <div className="flex flex-col gap-1">
          <h2 className="text-ui font-medium text-ink">The editor closed because access to “{pageTitle}” changed</h2>
          <p className="text-tiny text-ink-muted">
            {levelNow === null
              ? "Your access was removed while you were writing, so this page is no longer open to you."
              : `Your access was narrowed to ${accessLevelLabel[levelNow].toLowerCase()} while you were writing, so editing stopped here.`}
          </p>
          <p className="text-tiny text-ink">Your unsaved text was kept, not discarded.</p>
        </div>
      </div>
      {unsavedText ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-tiny font-medium text-ink-muted" htmlFor="access-revoked-unsaved">
            What you had written
          </label>
          <Textarea
            className="min-h-28 font-mono text-tiny"
            id="access-revoked-unsaved"
            readOnly
            value={unsavedText}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {unsavedText && onCopyUnsavedText ? (
          <Button onClick={onCopyUnsavedText} size="sm" variant="secondary">
            Copy your text
          </Button>
        ) : null}
        {onRequestAccess ? (
          <Button onClick={onRequestAccess} size="sm" variant="secondary">
            Request access
          </Button>
        ) : null}
        {onDismiss ? (
          <Button className="ml-auto" onClick={onDismiss} size="sm" variant="ghost">
            Close
          </Button>
        ) : null}
      </div>
    </div>
  );
}
