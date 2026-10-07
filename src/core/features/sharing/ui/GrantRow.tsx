import { CornerDownRight, Clock, MailCheck } from "lucide-react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import { Badge, Button, cn } from "../../../ui";
import { AccessLevelSelect } from "./AccessLevelSelect";
import { PrincipalIcon, PrincipalLabel, type GrantPrincipal } from "./principal";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Written out, and in UTC so the same grant reads the same everywhere. */
export function formatGrantDate(iso: string): string {
  const at = new Date(iso);
  return `${at.getUTCDate()} ${monthNames[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/** Where an inherited grant comes from (`SHARE-001`). */
export interface GrantInheritance {
  kind: "page" | "container";
  name: string;
}

export interface EffectiveGrant {
  id: string;
  principal: GrantPrincipal;
  level: AccessLevel;
  /** `page` is set on this page; `inherited` came from an ancestor or the container. */
  origin: "page" | "inherited";
  inheritedFrom?: GrantInheritance | null;
  /** `SHARE-008` — an expiry time, if this grant carries one. */
  expiresAt?: string | null;
  /** `SHARE-008` — past its expiry: shown as expired, never deleted. */
  expired?: boolean;
  /** `SHARE-006` — a guest invitation that has not been accepted yet. */
  pendingInvitation?: boolean;
  isSelf?: boolean;
}

export interface GrantRowProps {
  grant: EffectiveGrant;
  offeredLevels: readonly AccessLevel[];
  canChangeAccess: boolean;
  onLevelChange: (grantId: string, level: AccessLevel) => void;
  onRemove?: (grantId: string) => void;
  /** `SHARE-008` — re-granting an expired grant is one action. */
  onRegrant?: (grantId: string) => void;
  className?: string;
}

export function GrantRow({
  grant,
  offeredLevels,
  canChangeAccess,
  onLevelChange,
  onRemove,
  onRegrant,
  className,
}: GrantRowProps) {
  const { principal, inheritedFrom } = grant;
  const removeLabel = grant.pendingInvitation ? "Cancel invitation" : "Remove access";

  return (
    <div className={cn("flex items-start gap-2 py-1.5", className)}>
      <PrincipalIcon principal={principal} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <PrincipalLabel principal={principal} suffix={grant.isSelf ? "(you)" : null} />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {grant.origin === "inherited" && inheritedFrom ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-tiny text-ink-muted">
              <CornerDownRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-faint" />
              <span className="min-w-0 truncate">
                Inherited from {inheritedFrom.kind === "container" ? "the " : ""}
                <span className="text-ink">{inheritedFrom.name}</span>
              </span>
            </span>
          ) : null}
          {grant.origin === "page" && !grant.pendingInvitation && !grant.expired ? (
            <span className="text-tiny text-ink-faint">Set on this page</span>
          ) : null}
          {grant.pendingInvitation ? (
            <Badge tone="draft">
              <MailCheck aria-hidden="true" className="size-3" />
              Invitation pending
            </Badge>
          ) : null}
          {grant.expired ? <Badge tone="danger">Expired</Badge> : null}
          {grant.expiresAt && !grant.expired ? (
            <span className="inline-flex items-center gap-1 text-tiny text-warn">
              <Clock aria-hidden="true" className="size-3.5" />
              Expires {formatGrantDate(grant.expiresAt)}
            </span>
          ) : null}
          {grant.expiresAt && grant.expired ? (
            <span className="text-tiny text-ink-muted">Access ended {formatGrantDate(grant.expiresAt)}</span>
          ) : null}
        </div>
        {grant.pendingInvitation ? (
          <p className="text-tiny text-ink-muted">
            A guest invitation is on its way. Access starts when it is accepted, and cancelling it here ends the
            invitation.
          </p>
        ) : null}
        {grant.expired && canChangeAccess && onRegrant ? (
          <div>
            <Button onClick={() => onRegrant(grant.id)} size="sm" variant="secondary">
              Grant again
            </Button>
          </div>
        ) : null}
      </div>
      <AccessLevelSelect
        disabled={!canChangeAccess || grant.expired}
        offeredLevels={offeredLevels}
        onChange={(level) => onLevelChange(grant.id, level)}
        onRemove={onRemove ? () => onRemove(grant.id) : undefined}
        removeLabel={removeLabel}
        subjectName={principal.name}
        value={grant.level}
      />
    </div>
  );
}
