import { Button, Switch, cn } from "../../../ui";
import { FieldGlyph, fieldTypeLabel } from "./fields";
import type { DatabaseField, DatabaseLock } from "./types";

/**
 * `DB-003` — which of the database's fields this view shows, and how many. Every
 * field is listed whether or not it is shown, so nothing about the record is
 * hidden from the member who may read it.
 */
export function PropertyVisibilityList({
  fields,
  visibleFieldIds,
  lock = null,
  onToggleField,
  onShowAll,
  onHideAll,
  className,
}: {
  fields: readonly DatabaseField[];
  visibleFieldIds: readonly string[];
  lock?: DatabaseLock | null;
  onToggleField: (fieldId: string, visible: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  className?: string;
}) {
  const disabled = lock !== null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <ul className="flex flex-col">
        {fields.map((field) => {
          const visible = visibleFieldIds.includes(field.id);
          const labelId = `property-visibility-${field.id}`;
          return (
            <li className="flex items-center justify-between gap-2 py-1" key={field.id}>
              <span className="flex min-w-0 items-center gap-1.5" id={labelId}>
                <FieldGlyph className="size-3.5 shrink-0 text-ink-faint" type={field.type} />
                <span className="truncate text-ui text-ink">{field.name}</span>
                <span className="shrink-0 text-tiny text-ink-faint">{fieldTypeLabel[field.type]}</span>
              </span>
              <Switch
                aria-labelledby={labelId}
                checked={visible}
                disabled={disabled}
                onCheckedChange={(next) => onToggleField(field.id, next)}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2">
        <Button disabled={disabled} onClick={onShowAll} size="sm" variant="ghost">
          Show all
        </Button>
        <Button disabled={disabled} onClick={onHideAll} size="sm" variant="ghost">
          Hide all
        </Button>
      </div>
      {lock ? (
        <p className="text-tiny text-ink-muted">Field changes are rejected while the structure is locked by {lock.lockedBy}.</p>
      ) : null}
    </div>
  );
}
