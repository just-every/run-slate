import { NotRecomputedMarker, NotRecomputedNote } from "./NotRecomputedNote";
import type { FieldDensity, FieldRendererProps } from "./props";

/** Shows computed values distinctly from retained imported results. */
export function FormulaField({
  field,
  value,
  density = "cell",
}: FieldRendererProps & { density?: FieldDensity }) {
  const carried = value && value.kind === "carried" ? value.display : "";

  if (field.evaluationState === "current")
    return <span title="Computed from current records">{carried}</span>;

  if (density === "detail") {
    return (
      <div className="grid min-w-0 gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{carried}</span>
          <NotRecomputedMarker fieldName={field.name} />
        </span>
        <NotRecomputedNote
          expression={field.expression}
          fieldName={field.name}
          valueFrom={field.valueFrom}
        />
      </div>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{carried}</span>
      <NotRecomputedMarker fieldName={field.name} />
    </span>
  );
}
