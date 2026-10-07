import { Input } from "../../../../ui";
import type { DatabaseFieldType, FieldValue } from "../types";
import type { FieldRendererProps } from "./props";

function readText(value: FieldValue | null): string {
  if (!value) return "";
  if (value.kind === "text") return value.text;
  if (value.kind === "place") return value.label;
  return "";
}

function toValue(type: DatabaseFieldType, next: string): FieldValue | null {
  if (next === "") return null;
  return type === "place" ? { kind: "place", label: next } : { kind: "text", text: next };
}

/** `DB-002` — text, and the same treatment for a stored place name. */
export function TextField({ field, value, editable, onValueChange }: FieldRendererProps) {
  const text = readText(value);

  if (editable) {
    return (
      <Input
        aria-label={field.name}
        className="h-7 border-transparent bg-transparent px-1"
        value={text}
        onChange={(event) => onValueChange?.(field.id, toValue(field.type, event.target.value))}
      />
    );
  }

  return <span className="block truncate">{text}</span>;
}
