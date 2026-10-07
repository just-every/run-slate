import type { FieldRendererProps } from "./props";

/**
 * `DB-002` — url, email and phone. The scheme is already on the stored `href`,
 * so nothing here builds a link target. The underline, not a colour, marks it.
 */
export function LinkField({ field, value }: FieldRendererProps) {
  if (!value || value.kind !== "link") return null;

  const external = field.type === "url";

  return (
    <a
      className="block truncate text-ink underline decoration-line-strong underline-offset-2 hover:decoration-current"
      href={value.href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {value.label}
    </a>
  );
}
