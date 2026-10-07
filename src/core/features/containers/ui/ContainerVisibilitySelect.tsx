import { Globe, Lock, User, Users, UsersRound } from "lucide-react";
import type { ComponentType } from "react";
import {
  type ContainerVisibility,
  containerVisibilityValues,
} from "../../../shared/knowledge/model";
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from "../../../ui";
import { containerNoun } from "./nouns";
import { containerVisibilityCopy } from "./types";

const visibilityIcon: Record<ContainerVisibility, ComponentType<{ className?: string }>> = {
  default: Globe,
  open: UsersRound,
  closed: Users,
  private: Lock,
  personal: User,
};

export interface ContainerVisibilitySelectProps {
  id: string;
  value: ContainerVisibility;
  onChange: (next: ContainerVisibility) => void;
  /** `personal` is reachable only where a personal container is being described (`CONT-005`). */
  values?: readonly ContainerVisibility[];
  disabled?: boolean;
  className?: string;
}

/** CONT-001 — the five visibility values, each with its own line on who may see and join. */
export function ContainerVisibilitySelect({
  id,
  value,
  onChange,
  values = containerVisibilityValues,
  disabled,
  className,
}: ContainerVisibilitySelectProps) {
  const selected = containerVisibilityCopy[value];
  const SelectedIcon = visibilityIcon[value];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>Who can reach this {containerNoun}</Label>
      <Select disabled={disabled} onValueChange={(next) => onChange(next as ContainerVisibility)} value={value}>
        <SelectTrigger className="h-auto py-1.5" id={id}>
          <SelectValue aria-label={selected.label}>
            <span className="flex items-start gap-2 text-left">
              <SelectedIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <span className="flex flex-col">
                <span className="text-ui text-ink">{selected.label}</span>
                <span className="text-tiny text-ink-muted">{selected.description}</span>
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-w-[min(24rem,90vw)]">
          {values.map((option) => {
            const copy = containerVisibilityCopy[option];
            const Icon = visibilityIcon[option];
            return (
              <SelectItem key={option} value={option}>
                <span className="flex items-start gap-2">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                  <span className="flex flex-col">
                    <span className="text-ui text-ink">{copy.label}</span>
                    <span className="text-tiny text-ink-muted">{copy.description}</span>
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
