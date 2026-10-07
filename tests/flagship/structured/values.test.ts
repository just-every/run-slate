import { test, expect } from "vitest";
import {
  validateValue,
  aggregate,
  matches,
  fieldTypes,
  type Field,
} from "../../../src/core/features/databases/values";
import { validateFormulas } from "../../../src/core/features/databases/formulas";
test("editable fields accept null while computed mutations reject all supplied values", () => {
  for (const type of fieldTypes) {
    const field: Field = {
      id: type,
      name: type,
      type,
      position: 0,
      config: { options: ["Open", "Done"] },
    };
    if (["formula","rollup"].includes(type)) expect(()=>validateValue(field,null)).toThrow();
    else expect(validateValue(field, null)).toBeNull();
  }
  const number: Field = {
    id: "n",
    name: "Number",
    type: "number",
    position: 0,
    config: {},
  };
  expect(() => validateValue(number, "12")).toThrow();
  expect(() => validateValue(number, Infinity)).toThrow();
  expect(validateValue({ ...number, type: "date" }, "2026-09-27")).toBe(
    "2026-09-27",
  );
  expect(() =>
    validateValue({ ...number, type: "date" }, "not-a-date"),
  ).toThrow();
  expect(() =>
    validateValue({ ...number, type: "url" }, "javascript:alert(1)"),
  ).toThrow();
  expect(() =>
    validateValue({ ...number, type: "email" }, "invalid"),
  ).toThrow();
  expect(() =>
    validateValue(
      { ...number, type: "multi-select", config: { options: ["Open"] } },
      ["Unknown"],
    ),
  ).toThrow();
  expect(() =>
    validateValue({ ...number, type: "relation" }, ["duplicate", "duplicate"]),
  ).toThrow();
  expect(() => validateValue({ ...number, type: "formula" }, 1)).toThrow();
});
test("summaries and nested filters use only supplied filtered values", () => {
  const values = [null, 2, 4];
  expect(
    [
      "count",
      "filled",
      "empty",
      "sum",
      "average",
      "minimum",
      "maximum",
      "range",
      "percent",
    ].map((op) => aggregate(values, op)),
  ).toEqual([3, 2, 1, 6, 3, 2, 4, 2, 200 / 3]);
  expect(
    matches(
      { score: 4, state: "Open" },
      {
        and: [
          { field: "score", op: "gte", value: 3 },
          {
            or: [
              { field: "state", op: "eq", value: "Open" },
              { field: "state", op: "eq", value: "Done" },
            ],
          },
        ],
      },
    ),
  ).toBe(true);
});
test("formula validation catches absent references and typed operand mismatches before rows exist", () => {
  const field: Field = {
    id: "text",
    name: "Text",
    type: "text",
    config: {},
    position: 0,
  };
  const formula: Field = {
    id: "formula",
    name: "Formula",
    type: "formula",
    config: {
      expression: { op: "add", args: [{ field: "text" }, { literal: 1 }] },
    },
    position: 1,
  };
  expect(() => validateFormulas([field, formula])).toThrow(/numeric/);
  expect(() =>
    validateFormulas([
      { ...formula, config: { expression: { field: "missing" } } },
    ]),
  ).toThrow(/unknown/);
});
