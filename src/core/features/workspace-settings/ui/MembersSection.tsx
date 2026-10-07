import {
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  type SurfaceState,
} from "../../../ui";
import { InvitationRow } from "./InvitationRow";
import { InviteMemberForm } from "./InviteMemberForm";
import { MemberRow } from "./MemberRow";
import { SettingsSection } from "./SettingsSection";
import { memberNoun, pluralise, sentenceCase } from "./nouns";
import type { SettingsViewer, WorkspaceInvitation, WorkspaceMember, WorkspaceRole } from "./types";

export interface MembersSectionProps {
  state: SurfaceState;
  viewer: SettingsViewer;
  members: readonly WorkspaceMember[];
  invitations: readonly WorkspaceInvitation[];
  inviteEmail: string;
  onInviteEmailChange: (next: string) => void;
  inviteRole: WorkspaceRole;
  onInviteRoleChange: (next: WorkspaceRole) => void;
  onInvite: () => void;
  inviting?: boolean;
  onRoleChange: (memberId: string, role: WorkspaceRole) => void;
  onRemove: (memberId: string) => void;
  onRevokeInvitation: (invitationId: string) => void;
  onRetry?: () => void;
  errorDetail?: string;
  className?: string;
}

/**
 * `WORK-003`, `WORK-006`, `WORK-007`, `WORK-008` — the member list with roles,
 * invitation by email address, revocation of an unused invitation and removal.
 *
 * Every refusal in those clauses is a disabled control carrying its reason.
 * Guests are not here: `WORK-010` keeps them outside the member list and the
 * member count.
 */
export function MembersSection({
  state,
  viewer,
  members,
  invitations,
  inviteEmail,
  onInviteEmailChange,
  inviteRole,
  onInviteRoleChange,
  onInvite,
  inviting,
  onRoleChange,
  onRemove,
  onRevokeInvitation,
  onRetry,
  errorDetail,
  className,
}: MembersSectionProps) {
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const heading = sentenceCase(pluralise(memberNoun));

  return (
    <SettingsSection
      className={className}
      description={`Everyone who signs in to this workspace. Guests are counted and listed separately.`}
      title={heading}
    >
      <InviteMemberForm
        email={inviteEmail}
        onEmailChange={onInviteEmailChange}
        onRoleChange={onInviteRoleChange}
        onSubmit={onInvite}
        role={inviteRole}
        submitting={inviting}
        viewer={viewer}
      />

      {state === "loading" ? <LoadingState className="px-0" rows={5} /> : null}
      {state === "error" ? (
        <ErrorState detail={errorDetail} onRetry={onRetry} title={`Slate could not load the ${memberNoun} list.`} />
      ) : null}

      {state === "ready" || state === "empty" ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-ui font-medium text-ink">
              {members.length} {members.length === 1 ? memberNoun : pluralise(memberNoun)}
            </h3>
            {members.length === 0 ? (
              <EmptyState title={`This workspace has no ${pluralise(memberNoun)} yet.`} />
            ) : (
              <div className="relative overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{sentenceCase(memberNoun)}</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        onRemove={onRemove}
                        onRoleChange={onRoleChange}
                        ownerCount={ownerCount}
                        viewer={viewer}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-ui font-medium text-ink">Invitations</h3>
            {invitations.length === 0 ? (
              <p className="text-ui text-ink-muted">No invitation is outstanding.</p>
            ) : (
              <div className="relative overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invitation) => (
                      <InvitationRow
                        invitation={invitation}
                        key={invitation.id}
                        onRevoke={onRevokeInvitation}
                        viewer={viewer}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </SettingsSection>
  );
}
