import { Plus } from "lucide-react";
import { useId } from "react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../ui";
import { FieldGlyph } from "./fields";
import { layoutLabel } from "./LayoutGlyph";
import type { DatabaseField, DatabaseLayout } from "./types";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";

/** `DB-006` — the field types a view may group by. */
export const groupableFieldTypes = ["select", "status", "person", "checkbox", "date"] as const;

export function candidateFields(fields: readonly DatabaseField[], requirement: "group" | "date") {
  if (requirement === "date") return fields.filter((field) => field.type === "date");
  return fields.filter((field) => (groupableFieldTypes as readonly string[]).includes(field.type));
}

/**
 * `DB-004` — "A board or calendar requires the field it groups or dates by, and
 * offers to create it rather than failing when it is missing." This is that offer:
 * pick one of the fields that would serve, or create one.
 */
export function LayoutFieldOffer({
  layout,
  requirement,
  fields,
  selectedFieldId,
  onSelectField,
  onCreateField,
}: {
  layout: DatabaseLayout;
  requirement: "group" | "date";
  fields: readonly DatabaseField[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onCreateField: () => void;
}) {
  const selectId = useId();
  const candidates = candidateFields(fields, requirement);
  const verb = requirement === "group" ? "groups" : "dates";
  const noun = requirement === "group" ? "grouping field" : "date field";

  return (
    <div className="flex flex-col gap-2 rounded-card border border-warn/40 bg-warn-soft p-3">
      <p className="text-ui text-ink">
        A {layoutLabel[layout].toLowerCase()} {verb} each {knowledgeNoun("record")} by a field, and this view has no{" "}
        {noun} yet.
      </p>
      {candidates.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label className="text-tiny font-medium text-ink-muted" htmlFor={selectId}>
            Use an existing field
          </label>
          <Select onValueChange={onSelectField} value={selectedFieldId ?? undefined}>
            <SelectTrigger className="w-full max-w-64" id={selectId}>
              <SelectValue placeholder="Choose a field" />
            </SelectTrigger>
            <SelectContent>
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
        </div>
      ) : (
        <p className="text-tiny text-ink-muted">No field in this database can serve as the {noun}.</p>
      )}
      <div>
        <Button onClick={onCreateField} size="sm" variant="secondary">
          <Plus aria-hidden="true" className="size-3.5" />
          Create a {noun}
        </Button>
      </div>
    </div>
  );
}
