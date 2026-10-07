import { useEffect, useState } from "react";
import { Input } from "../../../../ui";
import type { FieldRendererProps } from "./props";

/**
 * `DB-002` — a stored number. The formatted string is produced upstream, so
 * reading shows `display` and editing reports the raw text the member typed
 * for the caller to format and store.
 */
export function NumberField({ field, value, editable, onValueChange }: FieldRendererProps) {
  const stored = value && value.kind === "number" ? value : null;

  // Keep partial numeric input while the parent echoes its parsed value.
  const number = stored?.number ?? null;
  const [draft, setDraft] = useState(number === null ? "" : String(number));
  useEffect(() => {
    setDraft((current) =>
      current !== "" && Number(current) === number ? current : number === null ? "" : String(number),
    );
  }, [number]);

  if (editable) {
    return (
      <Input
        aria-label={field.name}
        className="h-7 border-transparent bg-transparent px-1 tabular-nums"
        value={draft}
        inputMode="decimal"
        onChange={(event) => {
          const raw = event.target.value.trim();
          setDraft(event.target.value);
          if (raw === "") {
            onValueChange?.(field.id, null);
            return;
          }
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) return;
          onValueChange?.(field.id, { kind: "number", number: parsed, display: raw });
        }}
        type="number"
      />
    );
  }

  return <span className="block truncate tabular-nums">{stored ? stored.display : ""}</span>;
}
