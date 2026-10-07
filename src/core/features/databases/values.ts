import { validateFormulas } from "./formulas";
import { ApiProblem } from "../../app/problems";
export const fieldTypes = [
  "text",
  "number",
  "checkbox",
  "date",
  "select",
  "multi-select",
  "status",
  "person",
  "file",
  "url",
  "email",
  "phone",
  "place",
  "relation",
  "rollup",
  "formula",
  "created-at",
  "updated-at",
  "identifier",
] as const;
export type FieldType = (typeof fieldTypes)[number];
export interface Field {
  id: string;
  name: string;
  type: FieldType;
  config: Record<string, unknown>;
  position: number;
  evaluationState?: "current" | "retained-not-recomputed";
  readOnly?: boolean;
}
export type Values = Record<string, unknown>;
export function validateValue(field: Field, value: unknown): unknown {
  if (["formula", "rollup"].includes(field.type))
    throw new ApiProblem(400, "COMPUTED_FIELD", "Computed fields cannot be assigned.");
  if (value === null || value === undefined || value === "") return null;
  const fail = () => {
    throw new ApiProblem(
      400,
      "INVALID_FIELD_VALUE",
      `Invalid ${field.type} value for ${field.name}.`,
    );
  };
  switch (field.type) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) fail();
      break;
    case "checkbox":
      if (typeof value !== "boolean") fail();
      break;
    case "date":
    case "created-at":
    case "updated-at":
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
        fail();
      break;
    case "multi-select":
    case "person":
    case "file":
    case "relation":
      if (
        !Array.isArray(value) ||
        value.some((v) => typeof v !== "string") ||
        new Set(value).size !== value.length
      )
        fail();
      break;
    case "formula":
    case "rollup":
      throw new ApiProblem(
        400,
        "COMPUTED_FIELD",
        "Computed fields cannot be assigned.",
      );
    default:
      if (typeof value !== "string") fail();
  }
  if (
    ["select", "status", "multi-select"].includes(field.type) &&
    Array.isArray(field.config.options)
  ) {
    const options = field.config.options as string[];
    if (
      (Array.isArray(value) ? value : [value]).some(
        (v) => !options.includes(v as string),
      )
    )
      fail();
  }
  if (field.type === "url") {
    try {
      const u = new URL(value as string);
      if (!["https:", "http:"].includes(u.protocol)) fail();
    } catch {
      fail();
    }
  }
  if (
    field.type === "email" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)
  )
    fail();
  return value;
}
export type Expression =
  | {
      field: string;
    }
  | {
      literal: string | number | boolean | null;
    }
  | {
      op:
        | "add"
        | "subtract"
        | "multiply"
        | "divide"
        | "concat"
        | "equal"
        | "if"
        | "count";
      args: Expression[];
    };
export function evaluateFields(fields: Field[], raw: Values): Values {
  const result: Values = { ...raw },
    visiting = new Set<string>(),
    done = new Set<string>();
  let budget = 10000;
  function expr(e: Expression, depth = 0): unknown {
    if (--budget < 0 || depth > 64)
      throw new ApiProblem(
        400,
        "FORMULA_LIMIT",
        "Formula exceeds evaluation limits.",
      );
    if (!e || typeof e !== "object")
      throw new ApiProblem(
        400,
        "INVALID_FORMULA",
        "Formula must be a typed expression.",
      );
    if ("literal" in e) return e.literal;
    if ("field" in e) return field(e.field);
    if (!Array.isArray(e.args))
      throw new ApiProblem(400, "INVALID_FORMULA", "Arguments required.");
    const a = e.args.map((x) => expr(x, depth + 1));
    if (
      ["add", "subtract", "multiply", "divide"].includes(e.op) &&
      a.some((v) => v === null || v === undefined)
    )
      return null;
    const n = (i: number) => {
      if (typeof a[i] !== "number")
        throw new ApiProblem(400, "FORMULA_TYPE", "Numeric operand required.");
      return a[i] as number;
    };
    switch (e.op) {
      case "add":
        return a.reduce<number>((s, _, i) => s + n(i), 0);
      case "subtract":
        return n(0) - n(1);
      case "multiply":
        return a.reduce<number>((s, _, i) => s * n(i), 1);
      case "divide":
        return n(1) === 0 ? null : n(0) / n(1);
      case "concat":
        return a.map((v) => v ?? "").join("");
      case "equal":
        return a[0] === a[1];
      case "if":
        return a[0] ? a[1] : a[2];
      case "count":
        return Array.isArray(a[0])
          ? a[0].length
          : a.filter((v) => v !== null).length;
      default:
        throw new ApiProblem(
          400,
          "INVALID_FORMULA",
          "Unknown formula operator.",
        );
    }
  }
  function field(id: string): unknown {
    const f = fields.find((f) => f.id === id);
    if (!f)
      throw new ApiProblem(
        400,
        "UNKNOWN_FIELD",
        "Formula references an unknown field.",
      );
    if (done.has(id)) return result[id] ?? null;
    if (visiting.has(id))
      throw new ApiProblem(
        400,
        "FORMULA_CYCLE",
        "Formula dependencies contain a cycle.",
      );
    visiting.add(id);
    if (f.type === "formula" && f.config.expression)
      result[id] = expr(f.config.expression as Expression);
    if (typeof result[id] === "number" && !Number.isFinite(result[id]))
      throw new ApiProblem(
        400,
        "FORMULA_RANGE",
        "Formula result is not finite.",
      );
    visiting.delete(id);
    done.add(id);
    return result[id] ?? null;
  }
  for (const f of fields) field(f.id);
  return result;
}
export interface Filter {
  field?: string;
  op?:
    | "eq"
    | "ne"
    | "contains"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "empty"
    | "not-empty";
  value?: unknown;
  and?: Filter[];
  or?: Filter[];
}
export function matches(values: Values, f: Filter, depth = 0, fields: Field[] = []): boolean {
  if (depth > 32)
    throw new ApiProblem(400, "FILTER_LIMIT", "Filter nesting limit exceeded.");
  if (f.and) return f.and.every((x) => matches(values, x, depth + 1, fields));
  if (f.or) return f.or.some((x) => matches(values, x, depth + 1, fields));
  const v = values[f.field ?? ""] ?? null;
  const type = validateFormulas(fields).get(f.field ?? "") === "date" ? "date" : fields.find(x => x.id === f.field)?.type;
  const order = () => compare(v, f.value, type);
  switch (f.op) {
    case "eq":
      return order() === 0;
    case "ne":
      return order() !== 0;
    case "contains":
      return Array.isArray(v)
        ? v.includes(f.value)
        : typeof v === "string" && v.includes(String(f.value));
    case "empty":
      return v === null || v === "" || (Array.isArray(v) && v.length === 0);
    case "not-empty":
      return !matches(values, { ...f, op: "empty" }, depth, fields);
    case "gt":
      return order() > 0;
    case "gte":
      return order() >= 0;
    case "lt":
      return order() < 0;
    case "lte":
      return order() <= 0;
    default:
      throw new ApiProblem(400, "INVALID_FILTER", "Unknown filter operator.");
  }
}
export function compare(a: unknown, b: unknown, type?: FieldType): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  if (type && ["date", "created-at", "updated-at"].includes(type)) {
    const left = Date.parse(String(a)), right = Date.parse(String(b));
    if (!Number.isFinite(left) || !Number.isFinite(right)) throw new ApiProblem(400, "INVALID_DATE", "Date comparison requires valid instants.");
    return left - right;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean")
    return Number(a) - Number(b);
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}
export function aggregate(values: unknown[], operation: string): number | null {
  const filled = values.filter(
    (v) => v != null && v !== "" && (!Array.isArray(v) || v.length),
  );
  const nums = filled.filter((v): v is number => typeof v === "number");
  if (["sum", "average", "minimum", "maximum", "range"].includes(operation) && nums.length !== filled.length)
    throw new ApiProblem(400, "CALCULATION_TYPE", "Numeric calculation contains a nonnumeric value.");
  switch (operation) {
    case "count":
      return values.length;
    case "filled":
      return filled.length;
    case "empty":
      return values.length - filled.length;
    case "percent":
      return values.length ? (100 * filled.length) / values.length : 0;
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "average":
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case "minimum":
      return nums.length ? Math.min(...nums) : null;
    case "maximum":
      return nums.length ? Math.max(...nums) : null;
    case "range":
      return nums.length ? Math.max(...nums) - Math.min(...nums) : null;
    default:
      throw new ApiProblem(400, "INVALID_CALCULATION", "Unknown calculation.");
  }
}
