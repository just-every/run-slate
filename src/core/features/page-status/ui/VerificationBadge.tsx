import { AlertTriangle, BadgeCheck } from "lucide-react";
import { Button, cn } from "../../../ui";

export interface VerificationBadgeProps {
  /** The member who verified the page and owns the verification. */
  ownerName: string;
  /** When it was verified, written out. */
  verifiedAt: string;
  /** When it expires, written out; null where no expiry was set. */
  expiresAt: string | null;
  /** How the verified revision is named, such as "Version 12". */
  revisionLabel: string;
  /** False once the page has been edited since verification. */
  isCurrentRevision: boolean;
  onOpenVerifiedRevision?: () => void;
  onVerifyCurrent?: () => void;
}

/**
 * `STAT-003` — the badge shows the owner, the expiry and the revision verified, and says
 * when the verified revision is no longer the current one.
 */
export function VerificationBadge({
  ownerName,
  verifiedAt,
  expiresAt,
  revisionLabel,
  isCurrentRevision,
  onOpenVerifiedRevision,
  onVerifyCurrent,
}: VerificationBadgeProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-2.5 rounded-card border px-3 py-2.5",
        isCurrentRevision ? "border-good/30 bg-good-soft" : "border-warn/30 bg-warn-soft",
      )}
    >
      {isCurrentRevision ? (
        <BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-good" />
      ) : (
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-ui font-medium text-ink">
          {isCurrentRevision ? "Verified" : "Verified, but not on the current revision"}
        </p>
        <p className="text-ui text-ink-muted">
          {ownerName} verified {revisionLabel} on {verifiedAt}.{" "}
          {expiresAt ? `It expires on ${expiresAt}.` : "It has no expiry."}
        </p>
        {isCurrentRevision ? null : (
          <p className="text-tiny text-ink-muted">
            This page has been edited since. The verification still names {revisionLabel}, and nothing has
            re-verified what is on the page now.
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {onOpenVerifiedRevision ? (
          <Button onClick={onOpenVerifiedRevision} size="sm" variant="ghost">
            Open {revisionLabel}
          </Button>
        ) : null}
        {!isCurrentRevision && onVerifyCurrent ? (
          <Button onClick={onVerifyCurrent} size="sm" variant="secondary">
            Verify this revision
          </Button>
        ) : null}
      </div>
    </div>
  );
}
