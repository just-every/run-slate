import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Textarea, cn } from "../../../ui";
import type { DecisionOption } from "./types";

/**
 * `DEC-006` — the options a proposed decision weighs, while it is still
 * editable.
 *
 * Design decision: exactly one option is the chosen one, so the choice is a
 * radio group rather than a set of checkboxes; the control enforces the shape
 * the record has. New option identifiers come from the caller — this field never
 * invents one.
 */
export interface DecisionOptionsFieldProps {
  options: readonly DecisionOption[];
  onChangeOptionTitle: (id: string, title: string) => void;
  onChangeOptionNote: (id: string, note: string) => void;
  onChooseOption: (id: string) => void;
  onRemoveOption: (id: string) => void;
  onAddOption: () => void;
  disabled?: boolean;
  className?: string;
}

export function DecisionOptionsField({
  options,
  onChangeOptionTitle,
  onChangeOptionNote,
  onChooseOption,
  onRemoveOption,
  onAddOption,
  disabled = false,
  className,
}: DecisionOptionsFieldProps) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)} disabled={disabled}>
      <legend className="pb-1 text-tiny font-medium text-ink-muted">Options considered</legend>

      {options.length === 0 ? (
        <p className="text-ui text-ink-muted">No options yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((option, index) => (
            <li className="flex flex-col gap-1.5 rounded-card border border-line p-2" key={option.id}>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Option ${index + 1} title`}
                  onChange={(event) => onChangeOptionTitle(option.id, event.target.value)}
                  value={option.title}
                />
                <Button
                  aria-label={`Remove option ${index + 1}`}
                  onClick={() => onRemoveOption(option.id)}
                  size="iconSm"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </div>
              <Textarea
                aria-label={`Option ${index + 1} note`}
                className="min-h-12"
                onChange={(event) => onChangeOptionNote(option.id, event.target.value)}
                placeholder="What this option would mean"
                value={option.note ?? ""}
              />
              <label className="flex w-fit items-center gap-1.5 text-tiny text-ink-muted">
                <input
                  checked={option.chosen}
                  className="size-3.5 accent-accent"
                  name="decision-chosen-option"
                  onChange={() => onChooseOption(option.id)}
                  type="radio"
                />
                This is the chosen option
              </label>
            </li>
          ))}
        </ul>
      )}

      <Button className="self-start" onClick={onAddOption} size="sm" variant="secondary">
        <Plus aria-hidden="true" className="size-3.5" />
        Add an option
      </Button>
    </fieldset>
  );
}
