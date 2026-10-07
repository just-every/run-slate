import { ChevronDown } from "lucide-react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui";

/**
 * `SHARE-002` — the four rungs and what each one means. The ladder is ordered
 * strongest first, the way the panel reads it out.
 */
export const accessLevelLadder = ["full", "edit", "comment", "view"] as const satisfies readonly AccessLevel[];

export const accessLevelLabel: Record<AccessLevel, string> = {
  full: "Full access",
  edit: "Can edit",
  comment: "Can comment",
  view: "Can view",
};

export const accessLevelDefinition: Record<AccessLevel, string> = {
  full: "Read, edit, comment, share, and change access",
  edit: "Read, edit, and comment",
  comment: "Read and comment",
  view: "Read only",
};

/**
 * `SHARE-005` — a level removed from the offered list is hidden everywhere, so
 * every ladder in the product is drawn from this one filter.
 */
export function orderAccessLevels(offered: readonly AccessLevel[]): AccessLevel[] {
  return accessLevelLadder.filter((level) => offered.includes(level));
}

export interface AccessLevelSelectProps {
  value: AccessLevel;
  offeredLevels: readonly AccessLevel[];
  onChange: (level: AccessLevel) => void;
  /** Names what the level applies to, so the control has an accessible name. */
  subjectName: string;
  /** Read-only rows render the level as text rather than an unusable control. */
  disabled?: boolean;
  defaultOpen?: boolean;
  removeLabel?: string;
  onRemove?: () => void;
  className?: string;
}

export function AccessLevelSelect({
  value,
  offeredLevels,
  onChange,
  subjectName,
  disabled = false,
  defaultOpen,
  removeLabel,
  onRemove,
  className,
}: AccessLevelSelectProps) {
  const levels = orderAccessLevels(offeredLevels);

  if (disabled) {
    return (
      <span className={cn("shrink-0 px-2 py-1 text-ui text-ink-muted", className)}>{accessLevelLabel[value]}</span>
    );
  }

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        aria-label={`Access level for ${subjectName}`}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-control px-2 text-ui text-ink-muted transition-colors hover:bg-sidebar-hover hover:text-ink data-[state=open]:bg-sidebar-hover",
          className,
        )}
      >
        {accessLevelLabel[value]}
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64">
        <DropdownMenuRadioGroup onValueChange={(next) => onChange(next as AccessLevel)} value={value}>
          {levels.map((level) => (
            <DropdownMenuRadioItem key={level} value={level}>
              <span className="flex flex-col gap-0.5 py-0.5">
                <span className="font-medium text-ink">{accessLevelLabel[level]}</span>
                <span className="text-tiny text-ink-muted">{accessLevelDefinition[level]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {onRemove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger" onSelect={onRemove}>
              {removeLabel ?? "Remove access"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
