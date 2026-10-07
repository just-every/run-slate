import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { FieldCell, FieldGlyph, fieldTypeLabel } from "./fields";
import type { DatabaseField, DatabaseRecord, FieldValue } from "./types";
import { isNotRecomputed } from "./types";

/**
 * `DB-012` — a record's fields in a defined order with inline editing. A field the
 * member may not edit is shown and not editable rather than hidden, and the lock
 * mark says which it is.
 */
export function RecordFieldList({
  fields,
  record,
  canEditRecord,
  variant,
  onValueChange,
  onEditValue,
  onOpenLink,
  className,
}: {
  /** Already in the order the database defines. */
  fields: readonly DatabaseField[];
  record: DatabaseRecord;
  canEditRecord: boolean;
  /** `record-is-page` lays the list out beside the body; `record-is-row` is the whole record. */
  variant: "page" | "row";
  onValueChange: (fieldId: string, next: FieldValue | null) => void;
  onEditValue: (fieldId: string) => void;
  onOpenLink: (linkId: string) => void;
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-col", variant === "row" ? "divide-y divide-line" : "gap-1", className)}>
      {fields.map((field) => {
        const editable = canEditRecord && field.editable && !isNotRecomputed(field.type);
        const readOnlyBecauseOfAccess = canEditRecord && !field.editable;
        return (
          <div
            className={cn(
              "flex gap-2",
              variant === "row" ? "items-start py-2" : "items-center py-0.5",
            )}
            key={field.id}
          >
            <dt className={cn("flex shrink-0 items-center gap-1.5 text-ui text-ink-muted", variant === "row" ? "w-48" : "w-40")}>
              <FieldGlyph className="size-3.5 shrink-0 text-ink-faint" type={field.type} />
              <span className="truncate">{field.name}</span>
              <span className="sr-only"> ({fieldTypeLabel[field.type]})</span>
              {readOnlyBecauseOfAccess ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="shrink-0" tabIndex={0}>
                      <Lock aria-hidden="true" className="size-3 text-ink-faint" />
                      <span className="sr-only">Read-only for you</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    This {knowledgeNoun("member")} may not edit this field. It is shown, not hidden.
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </dt>
            <dd className="min-w-0 flex-1 text-ui text-ink">
              <FieldCell
                density="detail"
                editable={editable}
                field={field}
                onEdit={() => onEditValue(field.id)}
                onOpenLink={onOpenLink}
                onValueChange={(_fieldId, next) => onValueChange(field.id, next)}
                value={record.values[field.id] ?? null}
              />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
