import type { FieldDto } from "../../../../client/records";
export type Expression =
  | { field: string }
  | { literal: string | number | boolean | null }
  | { op: string; args: Expression[] };
const operations = [
  ["add", "Add"],
  ["subtract", "Subtract"],
  ["multiply", "Multiply"],
  ["divide", "Divide"],
  ["concat", "Join text"],
  ["count", "Count"],
  ["equal", "Equals"],
  ["if", "If / then / otherwise"],
];
export function FormulaBuilder({
  value,
  onChange,
  fields,
  depth = 0,
}: {
  value: Expression;
  onChange: (next: Expression) => void;
  fields: FieldDto[];
  depth?: number;
}) {
  const kind =
    "field" in value
      ? "field"
      : "literal" in value
        ? typeof value.literal
        : value.op;
  return (
    <fieldset className="formula-expression">
      <legend>{depth ? "Argument" : "Formula"}</legend>
      <label>
        Operation
        <select
          aria-label="Operation"
          value={kind}
          onChange={(event) => {
            const selected = event.target.value;
            onChange(
              selected === "field"
                ? { field: fields[0]?.id ?? "" }
                : selected === "number"
                  ? { literal: 0 }
                  : selected === "string"
                    ? { literal: "" }
                    : selected === "boolean"
                      ? { literal: false }
                      : {
                          op: selected,
                          args: Array.from(
                            {
                              length:
                                selected === "if"
                                  ? 3
                                  : selected === "count"
                                    ? 1
                                    : 2,
                            },
                            () => ({ literal: 0 }),
                          ),
                        },
            );
          }}
        >
          <option value="field">Field value</option>
          <option value="number">Number</option>
          <option value="string">Text</option>
          <option value="boolean">True / false</option>
          {depth < 8
            ? operations.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))
            : null}
        </select>
      </label>
      {"field" in value ? (
        <label>
          Field
          <select
            aria-label="Field"
            value={value.field}
            onChange={(e) => onChange({ field: e.target.value })}
          >
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
      ) : "literal" in value ? (
        <label>
          Value
          {typeof value.literal === "boolean" ? (
            <select
              value={String(value.literal)}
              onChange={(e) => onChange({ literal: e.target.value === "true" })}
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input
              type={typeof value.literal === "number" ? "number" : "text"}
              step="any"
              value={String(value.literal ?? "")}
              onChange={(e) =>
                onChange({
                  literal:
                    typeof value.literal === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          )}
        </label>
      ) : (
        value.args.map((arg, index) => (
          <FormulaBuilder
            key={index}
            value={arg}
            fields={fields}
            depth={depth + 1}
            onChange={(next) =>
              onChange({
                ...value,
                args: value.args.map((old, i) => (i === index ? next : old)),
              })
            }
          />
        ))
      )}
    </fieldset>
  );
}
