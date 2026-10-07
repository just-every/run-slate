import { useId } from "react";
import type { AutomationScope } from "../../../shared/knowledge/model";
import { Label, cn } from "../../../ui";
import { ruleScopeCopy } from "./types";

/**
 * `AUTO-005` — the scope selector. It is rendered only under `container` and
 * `site`; the `source` profile hides it because a rule there belongs to the one
 * database it was created from.
 *
 * Design decision: radios, not a select. Each value carries a line saying what
 * it covers, and that line has to be readable before the choice is made.
 */
export interface RuleScopeSelectProps {
  value: AutomationScope;
  onChange: (next: AutomationScope) => void;
  /** The values offered here. `site` is absent wherever the profile forbids it. */
  options: readonly AutomationScope[];
  /** What each value resolves to for this rule, e.g. the container's own name. */
  targetLabels: Partial<Record<AutomationScope, string>>;
  disabled?: boolean;
  className?: string;
}

export function RuleScopeSelect({
  value,
  onChange,
  options,
  targetLabels,
  disabled = false,
  className,
}: RuleScopeSelectProps) {
  const groupName = useId();

  return (
    <fieldset className={cn("flex flex-col gap-1.5", className)} disabled={disabled}>
      <legend className="pb-1 text-tiny font-medium text-ink">Scope</legend>
      {options.map((option) => {
        const copy = ruleScopeCopy[option];
        const optionId = `${groupName}-${option}`;
        const target = targetLabels[option];
        return (
          <div
            className={cn(
              "flex items-start gap-2 rounded-card border px-3 py-2",
              value === option ? "border-accent bg-accent-soft" : "border-line bg-surface",
            )}
            key={option}
          >
            <input
              checked={value === option}
              className="mt-1 size-3.5 accent-accent disabled:opacity-50"
              id={optionId}
              name={groupName}
              onChange={() => onChange(option)}
              type="radio"
              value={option}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label className="cursor-pointer font-medium" htmlFor={optionId}>
                {copy.label}
                {target ? <span className="ml-1.5 font-normal text-ink-muted">{target}</span> : null}
              </Label>
              <p className="text-tiny text-ink-muted">{copy.statement}</p>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
