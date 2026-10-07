import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type SurfaceState,
} from "../../../ui";
import { GuardedAction } from "./GuardedAction";
import { SettingsSection } from "./SettingsSection";
import { containerNoun, memberNoun, pluralise } from "./nouns";
import type { AccessLevel } from "../../../shared/knowledge/model";
import type { WorkspaceGuest } from "./types";

const accessLabel: Record<AccessLevel, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  full: "Full access",
};

/**
 * `WORK-010` — guests, listed with exactly what they were granted. A guest is
 * outside the member count and the member list, reaches nothing but their
 * grants, and sees no index, no member list and no search result beyond them.
 */
export function GuestsSection({
  state,
  guests,
  memberCount,
  onRevokeGrant,
  canAdminister,
  onRetry,
  errorDetail,
  className,
}: {
  state: SurfaceState;
  guests: readonly WorkspaceGuest[];
  /** Shown beside the guest count, to make the separation plain. */
  memberCount: number;
  onRevokeGrant?: (guestId: string, grantId: string) => void;
  canAdminister: boolean;
  onRetry?: () => void;
  errorDetail?: string;
  className?: string;
}) {
  return (
    <SettingsSection
      className={className}
      description={`A guest reaches only the pages and ${pluralise(containerNoun)} they were granted. They are not counted among the ${memberCount} ${memberCount === 1 ? memberNoun : pluralise(memberNoun)} of this workspace and do not appear in the ${memberNoun} list.`}
      title="Guests"
    >
      {state === "loading" ? <LoadingState className="px-0" rows={4} /> : null}
      {state === "error" ? (
        <ErrorState detail={errorDetail} onRetry={onRetry} title="Slate could not load the guest list." />
      ) : null}

      {state === "ready" || state === "empty" ? (
        guests.length === 0 ? (
          <EmptyState
            description="Sharing a page with an address that belongs to no one creates a guest invitation."
            title="No guests"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>What they were granted</TableHead>
                  <TableHead>Invited by</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((guest) => (
                  <TableRow key={guest.id}>
                    <TableCell>
                      <p className="text-ui text-ink">{guest.name ?? guest.email}</p>
                      {guest.name ? <p className="text-tiny text-ink-muted">{guest.email}</p> : null}
                      <p className="text-tiny text-ink-faint">
                        {guest.acceptedOn ? `Accepted ${guest.acceptedOn}` : "Has not accepted yet"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <ul className="flex flex-col gap-1">
                        {guest.grants.map((grant) => (
                          <li className="flex flex-wrap items-center gap-1.5 text-ui text-ink" key={grant.id}>
                            <span>{grant.target}</span>
                            <Badge tone="neutral">
                              {grant.targetKind === "container" ? containerNoun : "page"}
                            </Badge>
                            <Badge tone="outline">{accessLabel[grant.level]}</Badge>
                            {onRevokeGrant ? (
                              <GuardedAction
                                label="Revoke"
                                onClick={() => onRevokeGrant(guest.id, grant.id)}
                                reason={canAdminister ? null : "Only a workspace owner revokes a guest grant here."}
                                size="sm"
                                variant="ghost"
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ink-muted">{guest.invitedByName}</TableCell>
                    <TableCell className="text-right text-tiny text-ink-faint">
                      {guest.grants.length} {guest.grants.length === 1 ? "grant" : "grants"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </SettingsSection>
  );
}
