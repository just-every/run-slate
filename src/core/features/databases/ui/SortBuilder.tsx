import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { FieldGlyph } from "./fields";
import type { DatabaseField, DatabaseLock, SortDirection, SortRule } from "./types";

const directionLabel: Record<SortDirection, string> = {
  ascending: "Ascending",
  descending: "Descending",
};

/** `DB-005` — the ordered list of sorts, cleared in one action. */
export function SortBuilder({
  fields,
  sorts,
  lock = null,
  onChange,
  onAddSort,
  onClear,
  onMove,
  className,
}: {
  fields: readonly DatabaseField[];
  sorts: readonly SortRule[];
  lock?: DatabaseLock | null;
  onChange: (next: readonly SortRule[]) => void;
  onAddSort: () => void;
  onClear: () => void;
  onMove: (sortId: string, direction: "up" | "down") => void;
  className?: string;
}) {
  const disabled = lock !== null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {sorts.length === 0 ? (
        <p className="text-ui text-ink-muted">
          No sort yet. {knowledgeNoun("record")}s keep the order they were added in.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {sorts.map((sort, index) => {
            const field = fields.find((candidate) => candidate.id === sort.fieldId);
            const name = field ? field.name : `sort ${index + 1}`;
            return (
              <li className="flex flex-wrap items-center gap-1.5" key={sort.id}>
                <span className="w-5 shrink-0 text-tiny text-ink-faint">{index + 1}</span>

                <Select
                  disabled={disabled}
                  onValueChange={(next) =>
                    onChange(sorts.map((candidate) => (candidate.id === sort.id ? { ...candidate, fieldId: next } : candidate)))
                  }
                  value={sort.fieldId}
                >
                  <SelectTrigger aria-label={`Field for sort ${index + 1}`} className="h-7 w-40 text-tiny">
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
                  onValueChange={(next) =>
                    onChange(
                      sorts.map((candidate) =>
                        candidate.id === sort.id ? { ...candidate, direction: next as SortDirection } : candidate,
                      ),
                    )
                  }
                  value={sort.direction}
                >
                  <SelectTrigger aria-label={`Direction for ${name}`} className="h-7 w-36 text-tiny">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ascending">{directionLabel.ascending}</SelectItem>
                    <SelectItem value="descending">{directionLabel.descending}</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  aria-label={`Move ${name} earlier`}
                  disabled={disabled || index === 0}
                  onClick={() => onMove(sort.id, "up")}
                  size="iconSm"
                  variant="ghost"
                >
                  <ArrowUp aria-hidden="true" className="size-3.5" />
                </Button>
                <Button
                  aria-label={`Move ${name} later`}
                  disabled={disabled || index === sorts.length - 1}
                  onClick={() => onMove(sort.id, "down")}
                  size="iconSm"
                  variant="ghost"
                >
                  <ArrowDown aria-hidden="true" className="size-3.5" />
                </Button>
                <Button
                  aria-label={`Remove sort on ${name}`}
                  disabled={disabled}
                  onClick={() => onChange(sorts.filter((candidate) => candidate.id !== sort.id))}
                  size="iconSm"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex items-center gap-2">
        <Button disabled={disabled} onClick={onAddSort} size="sm" variant="ghost">
          <Plus aria-hidden="true" className="size-3.5" />
          Add a sort
        </Button>
        {sorts.length > 0 ? (
          <Button disabled={disabled} onClick={onClear} size="sm" variant="ghost">
            Clear all sorts
          </Button>
        ) : null}
      </div>

      {lock ? (
        <p className="text-tiny text-ink-muted">Sort changes are rejected while the structure is locked by {lock.lockedBy}.</p>
      ) : null}
    </div>
  );
}
