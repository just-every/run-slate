import { ApiProblem } from "../../app/problems";
import type { Expression, Field } from "./values";
type Type =
  "number" | "text" | "boolean" | "array" | "date" | "null" | "unknown";
export function validateFormulas(fields: Field[]) {
  const active = new Set<string>(),
    known = new Map<string, Type>();
  let nodes = 0;
  function expression(e: Expression, depth: number): Type {
    if (++nodes > 10000 || depth > 64)
      throw new ApiProblem(400, "FORMULA_LIMIT", "Formula exceeds its limits.");
    if (!e || typeof e !== "object")
      throw new ApiProblem(
        400,
        "INVALID_FORMULA",
        "Typed expression required.",
      );
    if ("field" in e) return field(e.field);
    if ("literal" in e) {
      if (e.literal === null) return "null";
      if (typeof e.literal === "number" && Number.isFinite(e.literal))
        return "number";
      if (typeof e.literal === "string") return "text";
      if (typeof e.literal === "boolean") return "boolean";
      throw new ApiProblem(400, "INVALID_FORMULA", "Invalid literal.");
    }
    if (!Array.isArray(e.args))
      throw new ApiProblem(
        400,
        "INVALID_FORMULA",
        "Expression arguments required.",
      );
    const types = e.args.map((a) => expression(a, depth + 1));
    if (["add", "subtract", "multiply", "divide"].includes(e.op)) {
      if (types.some((t) => t !== "number" && t !== "null"))
        throw new ApiProblem(
          400,
          "FORMULA_TYPE",
          "Arithmetic requires numeric fields.",
        );
      if (
        (["subtract", "divide"].includes(e.op) && types.length !== 2) ||
        !types.length
      )
        throw new ApiProblem(
          400,
          "FORMULA_ARITY",
          "Arithmetic argument count is invalid.",
        );
      return "number";
    }
    if (e.op === "concat") return "text";
    if (e.op === "count") return "number";
    if (e.op === "equal" && types.length === 2) return "boolean";
    if (
      e.op === "if" &&
      types.length === 3 &&
      ["boolean", "null"].includes(types[0])
    )
      return types[1] === types[2] ? types[1] : types[1] === "null" ? types[2] : types[2] === "null" ? types[1] : "unknown";
    throw new ApiProblem(
      400,
      "INVALID_FORMULA",
      "Unsupported operator or argument count.",
    );
  }
  function field(id: string): Type {
    if (known.has(id)) return known.get(id)!;
    if (active.has(id))
      throw new ApiProblem(
        400,
        "FORMULA_CYCLE",
        "Formula dependencies contain a cycle.",
      );
    const f = fields.find((f) => f.id === id);
    if (!f)
      throw new ApiProblem(
        400,
        "UNKNOWN_FIELD",
        "Formula references an unknown field.",
      );
    active.add(id);
    const type: Type =
      f.type === "formula"
        ? f.config.expression
          ? expression(f.config.expression as Expression, 0)
          : "unknown"
        : f.type === "rollup" && !f.config.relationField ? "unknown"
        : ["number", "rollup"].includes(f.type)
          ? "number"
          : f.type === "checkbox"
            ? "boolean"
            : ["relation", "person", "file", "multi-select"].includes(f.type)
              ? "array"
              : ["date", "created-at", "updated-at"].includes(f.type)
                ? "date"
                : "text";
    active.delete(id);
    known.set(id, type);
    return type;
  }
  for (const f of fields) field(f.id);
  return known;
}
