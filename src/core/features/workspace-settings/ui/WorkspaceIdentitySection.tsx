import { useId } from "react";
import { Button, ErrorState, Input, cn } from "../../../ui";
import { SettingsSection } from "./SettingsSection";

/**
 * `WORK-001` — the workspace's name and mark, editable here and shown in the
 * app header. A deployment holds exactly one workspace, so there is no list and
 * no create action on this pane.
 */
export function WorkspaceIdentitySection({
  name,
  onNameChange,
  mark,
  onMarkChange,
  dirty,
  onSave,
  onCancel,
  saving = false,
  failure,
  canEdit = true,
  className,
}: {
  name: string;
  onNameChange: (next: string) => void;
  /** One or two characters, or a single glyph, shown in the app header. */
  mark: string;
  onMarkChange: (next: string) => void;
  dirty: boolean;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  failure?: string | null;
  /** `WORK-008` — only a workspace owner administers the workspace. */
  canEdit?: boolean;
  className?: string;
}) {
  const fieldId = useId();

  return (
    <SettingsSection
      className={className}
      description="The name and mark every member sees in the app header. This deployment holds one workspace and creates no other."
      title="Workspace identity"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-mark`}>
              Mark
            </label>
            <Input
              className="w-16 text-center"
              disabled={!canEdit}
              id={`${fieldId}-mark`}
              maxLength={2}
              onChange={(event) => onMarkChange(event.target.value)}
              value={mark}
            />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-name`}>
              Name
            </label>
            <Input
              disabled={!canEdit}
              id={`${fieldId}-name`}
              onChange={(event) => onNameChange(event.target.value)}
              value={name}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-tiny font-medium text-ink-muted">In the app header</p>
          <div className="flex items-center gap-2 rounded-card border border-line bg-sidebar px-3 py-2">
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-control bg-ink text-micro font-semibold text-ink-inverse"
            >
              {mark}
            </span>
            <span className="text-ui font-medium text-ink">{name}</span>
          </div>
        </div>

        {canEdit ? null : (
          <p className="text-tiny text-ink-muted">Only a workspace owner can change the name and the mark.</p>
        )}

        {failure ? <ErrorState detail={failure} title="Slate could not save the workspace identity." /> : null}

        <div className={cn("flex items-center gap-2", !dirty && "opacity-60")}>
          <Button disabled={!canEdit || !dirty || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button disabled={!canEdit || !dirty || saving} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
