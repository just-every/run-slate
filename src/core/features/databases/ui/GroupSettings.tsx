import { useId } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, cn } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { candidateFields } from "./LayoutFieldOffer";
import { FieldGlyph } from "./fields";
import type { DatabaseField, DatabaseLock } from "./types";

const NO_GROUP = "none";

/** `DB-006` — the field a view groups by, and whether empty groups are hidden. */
export function GroupSettings({
  fields,
  groupFieldId,
  hideEmptyGroups,
  lock = null,
  onSelectGroupField,
  onHideEmptyGroupsChange,
  className,
}: {
  fields: readonly DatabaseField[];
  groupFieldId: string | null;
  hideEmptyGroups: boolean;
  lock?: DatabaseLock | null;
  onSelectGroupField: (fieldId: string | null) => void;
  onHideEmptyGroupsChange: (next: boolean) => void;
  className?: string;
}) {
  const selectId = useId();
  const switchId = useId();
  const disabled = lock !== null;
  const candidates = candidateFields(fields, "group");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <label className="text-tiny font-medium text-ink-muted" htmlFor={selectId}>
          Group by
        </label>
        <Select
          disabled={disabled}
          onValueChange={(next) => onSelectGroupField(next === NO_GROUP ? null : next)}
          value={groupFieldId ?? NO_GROUP}
        >
          <SelectTrigger className="w-full max-w-64" id={selectId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_GROUP}>No grouping</SelectItem>
            {candidates.map((field) => (
              <SelectItem key={field.id} value={field.id}>
                <span className="flex items-center gap-1.5">
                  <FieldGlyph className="size-3.5 text-ink-faint" type={field.type} />
                  {field.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-tiny text-ink-muted">
          A view groups its {knowledgeNoun("record")}s by a select, status, person, checkbox or date field.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-ui text-ink" id={switchId}>
          Hide empty groups
        </span>
        <Switch
          aria-labelledby={switchId}
          checked={hideEmptyGroups}
          disabled={disabled || groupFieldId === null}
          onCheckedChange={onHideEmptyGroupsChange}
        />
      </div>
    </div>
  );
}
