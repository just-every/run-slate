import { Checkbox, cn, Label } from "../../../ui";
import type { AiProposedChange } from "./types";

/**
 * `AI-005` — acceptance applies only the changes the member selected, so the
 * selection is per change and the default is not "all". Each row shows what the
 * change lands on and, where the run replaces something, the text before beside
 * the text after, so a member is choosing against the actual edit rather than a
 * summary of it.
 *
 * The checkbox is labelled by the change summary; the before/after pair is
 * described by it, so a screen reader reads the whole row as one decision.
 */
export function AiProposalChangeList({
  changes,
  selectedIds,
  onToggle,
  disabled = false,
  className,
}: {
  changes: readonly AiProposedChange[];
  selectedIds: readonly string[];
  onToggle: (changeId: string, next: boolean) => void;
  /** True once the proposal is accepted or discarded — the selection is frozen. */
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {changes.map((change) => {
        const checked = selectedIds.includes(change.id);
        const inputId = `ai-change-${change.id}`;
        return (
          <li
            className={cn(
              "rounded-card border p-2.5 transition-colors",
              checked ? "border-accent/40 bg-accent-soft/40" : "border-line bg-surface",
            )}
            key={change.id}
          >
            <div className="flex items-start gap-2.5">
              <Checkbox
                checked={checked}
                className="mt-0.5"
                disabled={disabled}
                id={inputId}
                onCheckedChange={(next) => onToggle(change.id, next === true)}
              />
              <div className="min-w-0 flex-1">
                <Label className="text-ui font-medium text-ink" htmlFor={inputId}>
                  {change.summary}
                </Label>
                <p className="mt-0.5 text-micro text-ink-faint">{change.targetLabel}</p>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {change.before === null ? null : (
                    <div className="min-w-0">
                      <p className="text-micro font-medium text-ink-faint">Before</p>
                      <p className="mt-0.5 rounded-control bg-danger-soft px-2 py-1.5 text-tiny whitespace-pre-wrap text-ink-muted">
                        {change.before}
                      </p>
                    </div>
                  )}
                  <div className={cn("min-w-0", change.before === null && "sm:col-span-2")}>
                    <p className="text-micro font-medium text-ink-faint">
                      {change.before === null ? "Would be added" : "After"}
                    </p>
                    <p className="mt-0.5 rounded-control bg-good-soft px-2 py-1.5 text-tiny whitespace-pre-wrap text-ink">
                      {change.after}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
