import type { FieldDto, ViewDto } from "../../../../client/records";
import type { FilterValue } from "./FilterBuilder";
export function ViewCriteria({
  view,
  fields,
  canClear,
  onClear,
}: {
  view: ViewDto;
  fields: FieldDto[];
  canClear: boolean;
  onClear: () => void;
}) {
  const name = (id?: string) =>
    id === "$title" ? "Name" : fields.find((field) => field.id === id)?.name ?? "Unavailable field";
  const describe = (value: FilterValue): string =>
    value.and
      ? `All of (${value.and.map(describe).join("; ")})`
      : value.or
        ? `Any of (${value.or.map(describe).join("; ")})`
        : `${name(value.field)} ${({ eq: "is", ne: "is not", contains: "contains", gt: "greater than", gte: "at least", lt: "less than", lte: "at most", empty: "is empty", "not-empty": "is not empty" } as Record<string, string>)[value.op ?? "eq"] ?? value.op}${["empty", "not-empty"].includes(value.op ?? "") ? "" : ` ${String(value.value ?? "")}`}`;
  if (!view.filters.length && !view.sorts.length) return null;
  return (
    <section className="view-criteria" aria-label="Applied view criteria">
      {view.filters.length ? (
        <>
          <p>
            Filters: {(view.filters as FilterValue[]).map(describe).join("; ")}
          </p>
          {canClear ? (
            <button onClick={onClear}>Clear view filters</button>
          ) : null}
        </>
      ) : null}
      {view.sorts.length ? (
        <p>
          Sort:{" "}
          {view.sorts
            .map(
              (sort) =>
                `${name(sort.field)} ${sort.direction === "desc" ? "descending" : "ascending"}`,
            )
            .join("; ")}
        </p>
      ) : null}
    </section>
  );
}
