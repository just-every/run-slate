import { Paperclip } from "lucide-react";
import type { FieldRendererProps } from "./props";

/**
 * `DB-002` — the named files a record carries. Names only: the component never
 * reaches for a file's bytes and never renders a preview it was not given.
 * Phrasing elements throughout, so the cell can sit inside its edit button.
 */
export function FileField({ value }: FieldRendererProps) {
  if (!value || value.kind !== "files" || value.files.length === 0) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {value.files.map((file) => (
        <span className="flex min-w-0 items-center gap-1" key={file.id}>
          <Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-ink-faint" />
          <span className="truncate">{file.name}</span>
        </span>
      ))}
    </span>
  );
}
