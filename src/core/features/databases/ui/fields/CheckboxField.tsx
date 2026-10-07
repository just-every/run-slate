import { Checkbox } from "../../../../ui";
import type { FieldRendererProps } from "./props";

/**
 * `DB-002` — a checkbox. `DB-012`: when the member may not edit it the control
 * is shown disabled rather than replaced by text, so the state still reads.
 */
export function CheckboxField({ field, value, editable, onValueChange }: FieldRendererProps) {
  const checked = value?.kind === "checkbox" ? value.checked : false;

  return (
    <Checkbox
      aria-label={field.name}
      checked={checked}
      disabled={!editable}
      onCheckedChange={(next) => onValueChange?.(field.id, { kind: "checkbox", checked: next === true })}
    />
  );
}
