import { Plus, X } from "lucide-react";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { FieldGlyph } from "./fields";
import type { DatabaseField, DatabaseLock, FilterConjunction, FilterOperator, FilterRule, FilterState } from "./types";
import { filterOperatorLabel, valuelessFilterOperators } from "./types";

const operatorOrder = Object.keys(filterOperatorLabel) as FilterOperator[];

function RuleRow({
  rule,
  index,
  conjunction,
  fields,
  disabled,
  onChangeRule,
  onChangeConjunction,
  onRemove,
}: {
  rule: FilterRule;
  index: number;
  conjunction: FilterConjunction;
  fields: readonly DatabaseField[];
  disabled: boolean;
  onChangeRule: (next: FilterRule) => void;
  onChangeConjunction: (next: FilterConjunction) => void;
  onRemove: () => void;
}) {
  const field = fields.find((candidate) => candidate.id === rule.fieldId);
  const takesValue = !valuelessFilterOperators.includes(rule.operator);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="w-16 shrink-0">
        {index === 0 ? (
          <span className="text-tiny text-ink-muted">Where</span>
        ) : index === 1 ? (
          <Select disabled={disabled} onValueChange={(next) => onChangeConjunction(next as FilterConjunction)} value={conjunction}>
            <SelectTrigger aria-label="Combine rules with" className="h-7 w-16 px-1.5 text-tiny">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">and</SelectItem>
              <SelectItem value="or">or</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="text-tiny text-ink-muted">{conjunction}</span>
        )}
      </div>

      <Select disabled={disabled} onValueChange={(next) => onChangeRule({ ...rule, fieldId: next })} value={rule.fieldId}>
        <SelectTrigger aria-label={`Field for rule ${index + 1}`} className="h-7 w-40 text-tiny">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              <span className="flex items-center gap-1.5">
                <FieldGlyph className="size-3.5 text-ink-faint" type={candidate.type} />
                {candidate.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        disabled={disabled}
        onValueChange={(next) => onChangeRule({ ...rule, operator: next as FilterOperator })}
        value={rule.operator}
      >
        <SelectTrigger aria-label={`Condition for ${field ? field.name : `rule ${index + 1}`}`} className="h-7 w-40 text-tiny">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operatorOrder.map((operator) => (
            <SelectItem key={operator} value={operator}>
              {filterOperatorLabel[operator]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {takesValue ? (
        <Input
          aria-label={`Value for ${field ? field.name : `rule ${index + 1}`}`}
          className="h-7 w-40 text-tiny"
          disabled={disabled}
          onChange={(event) => onChangeRule({ ...rule, value: event.target.value })}
          value={rule.value}
        />
      ) : null}

      <Button aria-label={`Remove rule ${index + 1}`} disabled={disabled} onClick={onRemove} size="iconSm" variant="ghost">
        <X aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}

/** `DB-005` — filter rules over any field, combined with and or or, cleared in one action. */
export function FilterBuilder({
  fields,
  filter,
  lock = null,
  onChange,
  onAddRule,
  onClear,
  className,
}: {
  fields: readonly DatabaseField[];
  filter: FilterState;
  lock?: DatabaseLock | null;
  onChange: (next: FilterState) => void;
  onAddRule: () => void;
  onClear: () => void;
  className?: string;
}) {
  const disabled = lock !== null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {filter.rules.length === 0 ? (
        <p className="text-ui text-ink-muted">
          No rule yet. Every {knowledgeNoun("record")} in this database is shown.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filter.rules.map((rule, index) => (
            <RuleRow
              conjunction={filter.conjunction}
              disabled={disabled}
              fields={fields}
              index={index}
              key={rule.id}
              onChangeConjunction={(next) => onChange({ ...filter, conjunction: next })}
              onChangeRule={(next) =>
                onChange({ ...filter, rules: filter.rules.map((candidate) => (candidate.id === rule.id ? next : candidate)) })
              }
              onRemove={() => onChange({ ...filter, rules: filter.rules.filter((candidate) => candidate.id !== rule.id) })}
              rule={rule}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button disabled={disabled} onClick={onAddRule} size="sm" variant="ghost">
          <Plus aria-hidden="true" className="size-3.5" />
          Add a rule
        </Button>
        {filter.rules.length > 0 ? (
          <Button disabled={disabled} onClick={onClear} size="sm" variant="ghost">
            Clear all rules
          </Button>
        ) : null}
      </div>

      {lock ? (
        <p className="text-tiny text-ink-muted">Filter changes are rejected while the structure is locked by {lock.lockedBy}.</p>
      ) : null}
    </div>
  );
}
