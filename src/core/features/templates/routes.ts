import {z} from 'zod';
import {permanentlyEraseTemplate} from './erasure';
import { parseInput } from "../databases/validation";
import { saveInput, changeInput, applyInput } from "./validation";
import { Hono } from "hono";
import type { AppEnvironment } from "../../app/types";
import { featureContext } from "../../app/feature-context";
import {
  listTemplates,
  previewTemplate,
  saveTemplate,
  changeTemplate,
  applyTemplate,
  templateAsset,
} from "./service";
export function createTemplatesRoutes() {
  const r = new Hono<AppEnvironment>();
  r.get("/", async (c) =>
    c.json(
      await listTemplates(featureContext(c), {
        containerId: c.req.query("containerId"),
        query: c.req.query("query"),
        category: c.req.query("category"),
        state:
          c.req.query("state") === "archived"
            ? "archived"
            : c.req.query("state") === "deleted"
              ? "deleted"
              : "active",
      }),
    ),
  );
  r.get("/:id/assets/:fileId", async (c) =>
    templateAsset(featureContext(c), c.req.param("id"), c.req.param("fileId")),
  );
  r.get("/:id", async (c) =>
    c.json(await previewTemplate(featureContext(c), c.req.param("id"))),
  );
  r.post("/", async (c) =>
    c.json(
      await saveTemplate(
        featureContext(c),
        parseInput(saveInput, await c.req.json()),
      ),
      201,
    ),
  );
  r.post("/:id/change", async (c) =>
    c.json(
      await changeTemplate(
        featureContext(c),
        c.req.param("id"),
        parseInput(changeInput, await c.req.json()),
      ),
    ),
  );
  r.post("/:id/apply", async (c) =>
    c.json(
      await applyTemplate(
        featureContext(c),
        c.req.param("id"),
        parseInput(applyInput, await c.req.json()),
      ),
      201,
    ),
  );
  r.post('/:id/permanent-delete',async c=>c.json(await permanentlyEraseTemplate(featureContext(c),c.req.param('id'),parseInput(z.object({operationKey:z.string(),expectedRevisionId:z.string(),confirmed:z.literal(true)}).strict(),await c.req.json()))));
  return r;
}
