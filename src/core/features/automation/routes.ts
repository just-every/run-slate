import { registerAutomationActivity } from "./activity";
import { parseInput } from "../databases/validation";
import { ruleInput } from "./validation";
import { Hono } from "hono";
import type { AppEnvironment } from "../../app/types";
import { featureContext } from "../../app/feature-context";
import { listRules, saveRule, runLog } from "./service";
export function createAutomationRoutes() {
  registerAutomationActivity();
  const r = new Hono<AppEnvironment>();
  r.get("/", async (c) => c.json(await listRules(featureContext(c))));
  r.post("/", async (c) =>
    c.json(
      await saveRule(
        featureContext(c),
        parseInput(ruleInput, await c.req.json()),
      ),
      201,
    ),
  );
  r.get("/:id/runs", async (c) =>
    c.json(await runLog(featureContext(c), c.req.param("id"))),
  );
  return r;
}
