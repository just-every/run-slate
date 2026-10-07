import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { mutationGuard } from "../../app/operations";
import { fields } from "./repository";
import { validateFormulas } from "./formulas";
import { aggregate, type Field, type Expression } from "./values";
const numeric = new Set(["sum", "average", "minimum", "maximum", "range"]);
/** Validate the effective cross-database graph before any definition is committed. */
export async function validateDependencies(ctx: FeatureContext, changedId: string, next: Field[]) {
  const rows = await ctx.db.prepare("SELECT id,revision_id FROM databases WHERE workspace_id=?").bind(ctx.actor.workspaceId).all<{id:string;revision_id:string}>();
  const definitions = new Map<string, Field[]>();
  for (const row of rows.results) definitions.set(row.id, row.id === changedId ? next : await fields(ctx,row.id));
  const types = new Map([...definitions].map(([id, fs]) => [id, validateFormulas(fs)]));
  const active = new Set<string>(), done = new Set<string>();
  function visit(db: string, id: string) {
    const key = `${db}:${id}`;
    if (active.has(key)) throw new ApiProblem(400,"COMPUTED_CYCLE","Computed dependencies must not contain a cycle.");
    if (done.has(key)) return;
    const fs = definitions.get(db), field = fs?.find(f=>f.id===id);
    if (!field) throw new ApiProblem(400,"STALE_FIELD_REFERENCE","A computed dependency does not exist.");
    active.add(key);
    function expression(e: Expression) {
      if ("field" in e) visit(db,e.field);
      else if ("args" in e) e.args.forEach(expression);
    }
    if (field.type === "formula" && field.config.expression) expression(field.config.expression as Expression);
    if (field.type === "rollup" && field.config.relationField) {
      const relation = fs!.find(f=>f.id===field.config.relationField && f.type === "relation");
      const targetDb = String(relation?.config.databaseId ?? ""), target = String(field.config.targetField ?? "");
      if (!relation) throw new ApiProblem(400,"INVALID_ROLLUP","Choose an existing relation field.");
      visit(targetDb,target);
      const calculation = String(field.config.calculation ?? "count");
      aggregate([],calculation);
      if (numeric.has(calculation) && types.get(targetDb)?.get(target) !== "number") throw new ApiProblem(400,"ROLLUP_TYPE","This calculation requires a numeric target field.");
    }
    active.delete(key); done.add(key);
  }
  for (const [db,fs] of definitions) for (const f of fs) visit(db,f.id);
  const views = await ctx.db.prepare("SELECT v.database_id,v.calculations_json FROM database_views v JOIN databases d ON d.id=v.database_id WHERE d.workspace_id=?").bind(ctx.actor.workspaceId).all<{database_id:string;calculations_json:string}>();
  for (const view of views.results) for (const [field,operation] of Object.entries(JSON.parse(view.calculations_json))) {
    if (numeric.has(String(operation)) && types.get(view.database_id)?.get(field) !== "number")
      throw new ApiProblem(400,"CALCULATION_TYPE","A saved view calculation requires this field to remain numeric.");
  }
  // A concurrent edit anywhere in the inspected graph cannot invalidate this proof.
  return rows.results.map(row=>mutationGuard(ctx.db,"SELECT revision_id=? FROM databases WHERE id=?",[row.revision_id,row.id]));
}
