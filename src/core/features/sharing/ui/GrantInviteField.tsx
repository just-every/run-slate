import { Info } from "lucide-react";
import { useId } from "react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Button, Input, Label, cn } from "../../../ui";
import { AccessLevelSelect } from "./AccessLevelSelect";

/**
 * What the caller worked out about the text in the field. The field never
 * decides this itself: it renders the answer it is given.
 */
export type InviteResolution =
  | { kind: "member"; name: string }
  | { kind: "group"; name: string; memberCount: number }
  | { kind: "guest"; address: string }
  | { kind: "invalid"; message: string };

export interface GrantInviteFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  level: AccessLevel;
  onLevelChange: (level: AccessLevel) => void;
  offeredLevels: readonly AccessLevel[];
  onInvite: () => void;
  /** Resolved from the typed text by the caller; `null` while nothing is typed. */
  resolution?: InviteResolution | null;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}

export function GrantInviteField({
  value,
  onValueChange,
  level,
  onLevelChange,
  offeredLevels,
  onInvite,
  resolution = null,
  busy = false,
  disabled = false,
  className,
}: GrantInviteFieldProps) {
  const fieldId = useId();
  const noteId = `${fieldId}-note`;
  const canInvite = !disabled && !busy && value.trim().length > 0 && resolution?.kind !== "invalid";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label className="sr-only" htmlFor={fieldId}>
        Address or group to give access to
      </Label>
      <div className="flex items-center gap-1">
        <Input
          aria-describedby={resolution ? noteId : undefined}
          className="min-w-0 flex-1"
          disabled={disabled}
          id={fieldId}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Address or group, separated by commas"
          value={value}
        />
        {value.trim().length > 0 ? (
          <AccessLevelSelect
            disabled={disabled}
            offeredLevels={offeredLevels}
            onChange={onLevelChange}
            subjectName="the people you are adding"
            value={level}
          />
        ) : null}
        <Button disabled={!canInvite} onClick={onInvite} size="md">
          {busy ? "Inviting…" : "Invite"}
        </Button>
      </div>
      {resolution ? (
        <p
          className={cn(
            "flex items-start gap-1.5 rounded-control px-2 py-1.5 text-tiny",
            resolution.kind === "invalid" ? "bg-danger-soft text-danger" : "bg-sidebar text-ink-muted",
          )}
          id={noteId}
          role={resolution.kind === "invalid" ? "alert" : "status"}
        >
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>{resolutionMessage(resolution)}</span>
        </p>
      ) : null}
    </div>
  );
}

function resolutionMessage(resolution: InviteResolution): string {
  switch (resolution.kind) {
    case "member":
      return `${resolution.name} already has an account here, so access starts as soon as you invite them.`;
    case "group":
      return `${resolution.name} is a group of ${resolution.memberCount} people. Everyone in it gets this level.`;
    case "guest":
      return `No ${knowledgeNoun("member")} uses ${resolution.address}. Inviting sends a guest invitation: they reach this page and nothing else, and the pending grant appears below until they accept it.`;
    case "invalid":
      return resolution.message;
  }
}
