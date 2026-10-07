import { Pencil } from "lucide-react";
import { cn, Input } from "../../../../ui";
import { type DatabaseFieldType, type FieldValue, isNotRecomputed } from "../types";
import { CheckboxField } from "./CheckboxField";
import { FieldDisplay } from "./FieldDisplay";
import { NumberField } from "./NumberField";
import type { FieldDensity, FieldRendererProps } from "./props";
import { TextField } from "./TextField";

/** `DB-002` — the fields the system writes. Shown, never editable (`DB-012`). */
export const readOnlyTypes: readonly DatabaseFieldType[] = [
  "created-time",
  "created-by",
  "updated-time",
  "updated-by",
  "identifier",
];

/** Edited in place, in the cell itself. Everything else opens a picker. */
export const inlineEditableTypes: readonly DatabaseFieldType[] = [
  "text",
  "place",
  "number",
  "checkbox",
  "url",
  "email",
  "phone",
];

const linkInputType: Partial<Record<DatabaseFieldType, string>> = {
  url: "url",
  email: "email",
  phone: "tel",
};

export interface FieldCellProps extends Omit<FieldRendererProps, "editable" | "value"> {
  /** `null`, or a missing value, is the field's empty value. */
  value: FieldValue | null | undefined;
  /** The caller's gate: whether this surface allows editing at all. */
  editable?: boolean;
  density?: FieldDensity;
  onOpenLink?: (linkId: string) => void;
  className?: string;
}

/**
 * The one place a stored value meets a renderer. `DB-012`: a field the member
 * may not edit is shown and not editable, never hidden. `DB-002`: a rollup or
 * formula is never editable and always carries its not-recomputed mark.
 */
export function FieldCell({
  field,
  value,
  editable = true,
  density = "cell",
  onValueChange,
  onEdit,
  onOpenLink,
  className,
}: FieldCellProps) {
  const current = value ?? null;
  const canEdit =
    editable && field.editable && !isNotRecomputed(field.type) && !readOnlyTypes.includes(field.type);
  const wrapper = cn("flex w-full min-w-0 items-center text-ui text-ink", className);

  if (canEdit && inlineEditableTypes.includes(field.type)) {
    const inputType = linkInputType[field.type];
    if (inputType) {
      const label = current && current.kind === "link" ? current.label : "";
      return (
        <div className={wrapper}>
          <Input
            aria-label={field.name}
            className="h-7 border-transparent bg-transparent px-1"
            value={label}
            // The caller normalises and stores the scheme; nothing is invented here.
            onChange={(event) => {
              const next = event.target.value;
              onValueChange?.(field.id, next === "" ? null : { kind: "link", href: next, label: next });
            }}
            type={inputType}
          />
        </div>
      );
    }
    const editor =
      field.type === "number" ? (
        <NumberField editable field={field} onValueChange={onValueChange} value={current} />
      ) : field.type === "checkbox" ? (
        <CheckboxField editable field={field} onValueChange={onValueChange} value={current} />
      ) : (
        <TextField editable field={field} onValueChange={onValueChange} value={current} />
      );
    return <div className={wrapper}>{editor}</div>;
  }

  // A checkbox and a not-recomputed field render themselves when empty.
  const rendersWhenEmpty = field.type === "checkbox" || isNotRecomputed(field.type);
  const body =
    current === null && !rendersWhenEmpty ? (
      density === "detail" ? (
        <span className="text-ink-faint">Empty</span>
      ) : null
    ) : (
      <FieldDisplay density={density} field={field} onOpenLink={onOpenLink} value={current} />
    );

  // A relation's linked entries are buttons already, so the cell is never
  // wrapped in one: editing gets its own control beside them.
  if (field.type === "relation") {
    return (
      <div className={cn(wrapper, "gap-1")}>
        {body}
        {canEdit ? (
          <button
            aria-label={`Edit ${field.name}`}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-control text-ink-faint hover:bg-sidebar-hover hover:text-ink"
            onClick={() => onEdit?.(field.id)}
            type="button"
          >
            <Pencil aria-hidden="true" className="size-3" />
          </button>
        ) : null}
      </div>
    );
  }

  if (canEdit) {
    return (
      <div className={wrapper}>
        <button
          className="flex min-h-6 w-full min-w-0 items-center rounded-control px-1 text-left hover:bg-sidebar-hover"
          onClick={() => onEdit?.(field.id)}
          type="button"
        >
          <span className="sr-only">{`Edit ${field.name}`}</span>
          <span className="flex min-w-0 items-center">{body}</span>
        </button>
      </div>
    );
  }

  return <div className={wrapper}>{body}</div>;
}
