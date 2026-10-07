import { cn } from "../../../../ui";
import { type FieldOption, recordColourClass, recordColourDotClass } from "../types";
import type { FieldRendererProps } from "./props";

/**
 * One stored option. A status chip carries a dot *and* its label, so the state
 * never depends on colour alone.
 */
export function OptionChip({
  option,
  withDot = false,
  className,
}: {
  option: FieldOption;
  withDot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-control px-1.5 py-0.5 text-tiny",
        recordColourClass[option.colour],
        className,
      )}
    >
      {withDot ? (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", recordColourDotClass[option.colour])}
        />
      ) : null}
      <span className="truncate">{option.label}</span>
    </span>
  );
}

/** `DB-002` — select, multi-select and status all read from the field's options. */
export function OptionsField({ field, value }: FieldRendererProps) {
  if (!value || value.kind !== "options") return null;

  const options = field.options ?? [];
  const chosen = value.optionIds
    .map((optionId) => options.find((option) => option.id === optionId))
    .filter((option): option is FieldOption => option !== undefined);

  if (chosen.length === 0) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {chosen.map((option) => (
        <OptionChip key={option.id} option={option} withDot={field.type === "status"} />
      ))}
    </span>
  );
}
