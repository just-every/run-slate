import { Clock3 } from "lucide-react";
import { Button } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";

export interface LapsedVerificationNoticeProps {
  /** The member who owned the verification. */
  ownerName: string;
  /** The status entry that has lapsed, such as "Verified". */
  statusLabel: string;
  /** When the expiry passed, written out. */
  lapsedAt: string;
  /** How the verified revision is named, such as "Version 12". */
  revisionLabel: string;
  /** When the owner was notified, written out. */
  notifiedAt: string;
  onVerifyAgain?: () => void;
}

/**
 * `STAT-004` — once the expiry passes the page reads lapsed rather than verified. The
 * owner was notified once, the original verification stays in history, and nothing
 * renews it: there is no automatic renewal and no AI action can renew it.
 */
export function LapsedVerificationNotice({
  ownerName,
  statusLabel,
  lapsedAt,
  revisionLabel,
  notifiedAt,
  onVerifyAgain,
}: LapsedVerificationNoticeProps) {
  return (
    <div className="flex flex-wrap items-start gap-2.5 rounded-card border border-warn/30 bg-warn-soft px-3 py-2.5">
      <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-ui font-medium text-ink">This page reads lapsed, not {statusLabel.toLowerCase()}.</p>
        <p className="text-ui text-ink-muted">
          {ownerName} verified {revisionLabel}, and that verification expired on {lapsedAt}. It stays in this
          page&rsquo;s history, and it no longer reads as current in search, in content queries, in AI answers
          or in exports.
        </p>
        <p className="text-tiny text-ink-muted">
          {ownerName} was notified once, on {notifiedAt}, and will not be notified again. Nothing renews a
          lapsed verification: there is no automatic renewal, and no AI action can renew it. A{" "}
          {knowledgeNoun("member")} has to read the current revision and verify it again.
        </p>
      </div>
      {onVerifyAgain ? (
        <Button className="shrink-0" onClick={onVerifyAgain} size="sm" variant="secondary">
          Verify this revision
        </Button>
      ) : null}
    </div>
  );
}
