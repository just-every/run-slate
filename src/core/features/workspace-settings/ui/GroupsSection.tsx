import { useId } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  type SurfaceState,
} from "../../../ui";
import { GroupRow } from "./GroupRow";
import { SettingsSection } from "./SettingsSection";
import { memberNoun, pluralise } from "./nouns";
import type { WorkspaceGroup, WorkspaceMember } from "./types";

export interface GroupsSectionProps {
  state: SurfaceState;
  groups: readonly WorkspaceGroup[];
  members: readonly WorkspaceMember[];
  /** The ids of the groups whose membership is expanded. */
  openGroupIds: readonly string[];
  onOpenChange: (groupId: string, open: boolean) => void;
  newGroupName: string;
  onNewGroupNameChange: (next: string) => void;
  onCreateGroup: () => void;
  creating?: boolean;
  onAddMember: (groupId: string, memberId: string) => void;
  onRemoveMember: (groupId: string, memberId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  canAdminister: boolean;
  onRetry?: () => void;
  errorDetail?: string;
  className?: string;
}

/**
 * `WORK-009` — named groups, usable as a grant principal anywhere a person can
 * be used. Changing a group's membership changes access at once; deleting a
 * group removes its grants and leaves its members' own grants alone.
 */
export function GroupsSection({
  state,
  groups,
  members,
  openGroupIds,
  onOpenChange,
  newGroupName,
  onNewGroupNameChange,
  onCreateGroup,
  creating,
  onAddMember,
  onRemoveMember,
  onDeleteGroup,
  canAdminister,
  onRetry,
  errorDetail,
  className,
}: GroupsSectionProps) {
  const fieldId = useId();

  return (
    <SettingsSection
      className={className}
      description={`A group can be granted access anywhere a person can. Changing who is in it changes access at once, and deleting it removes only the grants that name the group.`}
      title="Groups"
    >
      <form
        className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-sidebar p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canAdminister) onCreateGroup();
        }}
      >
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label className="text-tiny font-medium text-ink-muted" htmlFor={fieldId}>
            New group name
          </label>
          <Input
            disabled={!canAdminister || creating}
            id={fieldId}
            onChange={(event) => onNewGroupNameChange(event.target.value)}
            placeholder="Support engineering"
            value={newGroupName}
          />
        </div>
        <Button disabled={!canAdminister || creating || newGroupName.trim().length === 0} type="submit">
          {creating ? "Creating…" : "Create group"}
        </Button>
        {canAdminister ? null : (
          <p className="w-full text-tiny text-ink-muted">Only a workspace owner creates a group.</p>
        )}
      </form>

      {state === "loading" ? <LoadingState className="px-0" rows={4} /> : null}
      {state === "error" ? (
        <ErrorState detail={errorDetail} onRetry={onRetry} title="Slate could not load the groups." />
      ) : null}

      {state === "ready" || state === "empty" ? (
        groups.length === 0 ? (
          <EmptyState
            description={`A group holds ${pluralise(memberNoun)} and can be granted access as one principal.`}
            title="No groups yet"
          />
        ) : (
          <ul className="flex flex-col">
            {groups.map((group) => (
              <GroupRow
                canAdminister={canAdminister}
                group={group}
                key={group.id}
                members={members}
                onAddMember={onAddMember}
                onDelete={onDeleteGroup}
                onOpenChange={(open) => onOpenChange(group.id, open)}
                onRemoveMember={onRemoveMember}
                open={openGroupIds.includes(group.id)}
              />
            ))}
          </ul>
        )
      ) : null}
    </SettingsSection>
  );
}
