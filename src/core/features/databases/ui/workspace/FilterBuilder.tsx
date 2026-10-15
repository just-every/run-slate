import type { FieldDto } from "../../../../client/records";
import { fieldView } from "../../../../client/records";
export type FilterValue = {
  field?: string;
  op?: string;
  value?: unknown;
  and?: FilterValue[];
  or?: FilterValue[];
};
const operators = [
  ["eq", "is"],
  ["ne", "is not"],
  ["contains", "contains"],
  ["gt", "greater than"],
  ["gte", "at least"],
  ["lt", "less than"],
  ["lte", "at most"],
  ["empty", "is empty"],
  ["not-empty", "is not empty"],
];
export function FilterBuilder({
  filters,
  fields,
  onChange,
  depth = 0,
}: {
  filters: FilterValue[];
  fields: FieldDto[];
  onChange: (value: FilterValue[]) => void;
  depth?: number;
}) {
  const change = (index: number, value: FilterValue) =>
    onChange(filters.map((old, i) => (i === index ? value : old)));
  return (
    <div className="filter-builder">
      {filters.map((filter, index) => {
        const group = filter.and ?? filter.or;
        const field = fields.find((item) => item.id === filter.field);
        return (
          <fieldset key={index}>
            <legend>{group ? "Condition group" : "Condition"}</legend>
            {group ? (
              <>
                <select
                  aria-label="Match conditions"
                  value={filter.or ? "or" : "and"}
                  onChange={(event) =>
                    change(index, { [event.target.value]: group })
                  }
                >
                  <option value="and">All must match</option>
                  <option value="or">Any may match</option>
                </select>
                <FilterBuilder
                  filters={group}
                  fields={fields}
                  depth={depth + 1}
                  onChange={(value) =>
                    change(index, filter.or ? { or: value } : { and: value })
                  }
                />
              </>
            ) : (
              <>
                <label>
                  Field
                  <select
                    aria-label="Field"
                    value={filter.field ?? ""}
                    required
                    onChange={(event) =>
                      change(index, {
                        field: event.target.value,
                        op: "eq",
                        value: "",
                      })
                    }
                  >
                    <option value="" disabled>
                      Choose a field
                    </option>
                    {fields.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Condition
                  <select
                    aria-label="Condition"
                    value={filter.op ?? "eq"}
                    onChange={(event) =>
                      change(index, { ...filter, op: event.target.value })
                    }
                  >
                    {operators.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {!["empty", "not-empty"].includes(filter.op ?? "") ? (
                  <label>
                    Value
                    {field?.type === "checkbox" ? (
                      <select
                        value={String(filter.value ?? false)}
                        onChange={(event) =>
                          change(index, {
                            ...filter,
                            value: event.target.value === "true",
                          })
                        }
                      >
                        <option value="true">Checked</option>
                        <option value="false">Unchecked</option>
                      </select>
                    ) : field && ["select", "status", "multi-select"].includes(field.type) ? (
                      <select
                        value={String(filter.value ?? "")}
                        onChange={(event) => change(index, { ...filter, value: event.target.value })}
                      >
                        <option value="">Choose an option</option>
                        {fieldView(field).options?.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          field?.type === "number"
                            ? "number"
                            : field?.type === "date"
                              ? "date"
                              : "text"
                        }
                        value={String(filter.value ?? "")}
                        onChange={(event) =>
                          change(index, {
                            ...filter,
                            value:
                              field?.type === "number"
                                ? Number(event.target.value)
                                : event.target.value,
                          })
                        }
                      />
                    )}
                  </label>
                ) : null}
              </>
            )}
            <button
              type="button"
              onClick={() => onChange(filters.filter((_, i) => i !== index))}
            >
              Remove condition
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        disabled={!fields.length}
        onClick={() =>
          onChange([...filters, { field: fields[0]?.id, op: "eq", value: "" }])
        }
      >
        Add condition
      </button>
      {depth < 8 ? (
        <button
          type="button"
          onClick={() => onChange([...filters, { and: [] }])}
        >
          Add condition group
        </button>
      ) : null}
    </div>
  );
}
