import type { FieldRendererProps } from "./props";

/**
 * `DB-002` — a stored date, or a range when the value carries an end. Both
 * strings are formatted upstream; nothing here parses or computes a date.
 */
export function DateField({ value }: FieldRendererProps) {
  if (!value || value.kind !== "date") return null;

  return (
    <span className="flex min-w-0 items-baseline gap-1 truncate">
      <span className="truncate">{value.display}</span>
      {value.endDisplay ? (
        <>
          <span aria-hidden="true" className="text-ink-faint">
            –
          </span>
          <span className="sr-only">to</span>
          <span className="truncate">{value.endDisplay}</span>
        </>
      ) : null}
    </span>
  );
}
