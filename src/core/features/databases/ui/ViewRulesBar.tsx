import { ArrowDown, ArrowUp, Group, ListFilter } from "lucide-react";
import { Badge, Button, cn } from "../../../ui";
import type { DatabaseField, DatabaseView } from "./types";
import { filterOperatorLabel, findField, valuelessFilterOperators } from "./types";

/**
 * `DB-005` — the filter and the sorts a view carries, shown in force above the
 * records, and cleared in one action. `DB-006` adds the field the view groups by.
 */
export function ViewRulesBar({
  view,
  fields,
  onOpenFilter,
  onOpenSort,
  onOpenGroup,
  onClearAll,
  className,
}: {
  view: DatabaseView;
  fields: readonly DatabaseField[];
  onOpenFilter: () => void;
  onOpenSort: () => void;
  onOpenGroup: () => void;
  onClearAll: () => void;
  className?: string;
}) {
  const groupField = findField(fields, view.groupFieldId);
  const hasRules = view.filter.rules.length > 0 || view.sorts.length > 0;
  if (!hasRules && !groupField) return null;

  return (
    <div
      aria-label="Rules in force on this view"
      className={cn("flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2", className)}
    >
      {view.filter.rules.map((rule, index) => {
        const field = findField(fields, rule.fieldId);
        const takesValue = !valuelessFilterOperators.includes(rule.operator);
        return (
          <span className="flex items-center gap-1.5" key={rule.id}>
            {index > 0 ? <span className="text-tiny text-ink-faint">{view.filter.conjunction}</span> : null}
            <Button className="h-6" onClick={onOpenFilter} size="sm" variant="secondary">
              <ListFilter aria-hidden="true" className="size-3" />
              <span className="font-medium">{field ? field.name : rule.fieldId}</span>
              <span className="text-ink-muted">{filterOperatorLabel[rule.operator]}</span>
              {takesValue ? <span className="font-medium">{rule.value}</span> : null}
            </Button>
          </span>
        );
      })}

      {view.sorts.map((sort, index) => {
        const field = findField(fields, sort.fieldId);
        return (
          <Button className="h-6" key={sort.id} onClick={onOpenSort} size="sm" variant="secondary">
            {sort.direction === "ascending" ? (
              <ArrowUp aria-hidden="true" className="size-3" />
            ) : (
              <ArrowDown aria-hidden="true" className="size-3" />
            )}
            <span className="font-medium">{field ? field.name : sort.fieldId}</span>
            <span className="text-ink-muted">
              {sort.direction}
              {view.sorts.length > 1 ? ` · ${index + 1}` : ""}
            </span>
          </Button>
        );
      })}

      {groupField ? (
        <Button className="h-6" onClick={onOpenGroup} size="sm" variant="secondary">
          <Group aria-hidden="true" className="size-3" />
          <span className="text-ink-muted">Grouped by</span>
          <span className="font-medium">{groupField.name}</span>
        </Button>
      ) : null}

      {view.hideEmptyGroups && groupField ? <Badge tone="outline">Empty groups hidden</Badge> : null}

      {hasRules ? (
        <Button className="h-6" onClick={onClearAll} size="sm" variant="ghost">
          Clear filter and sort
        </Button>
      ) : null}
    </div>
  );
}
