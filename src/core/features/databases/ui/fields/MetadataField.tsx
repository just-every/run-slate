import { PersonChip } from "./PersonField";
import type { FieldRendererProps } from "./props";

/**
 * `DB-002` — created and updated time, created and updated by, and the
 * identifier. The system writes these, so they are shown and never editable
 * (`DB-012`).
 */
export function MetadataField({ value }: FieldRendererProps) {
  if (!value) return null;

  if (value.kind === "identifier") {
    return <span className="block truncate font-mono text-tiny text-ink-muted">{value.display}</span>;
  }

  if (value.kind !== "metadata") return null;

  if (value.person) {
    return <PersonChip person={value.person} />;
  }

  return <span className="block truncate text-ink-muted">{value.display}</span>;
}
