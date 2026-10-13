import { templateDestinations, templatePermissions } from "./permissions";
import { previewSnapshot, findAsset } from "./assets";
import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { commitOperation, mutationGuard } from "../../app/operations";
import {
  requireContainerLevel,
  currentSubject,
} from "../sharing/current-access";
import { destination } from "../pages/service";
import { labelForReader } from "../pages/mentions";
import { createUlid } from "../../shared/ulid";
import { revision } from "../databases/repository";
import {
  snapshotPage,
  currentSnapshot,
  prepareSnapshot,
  type TemplateSnapshot,
} from "./snapshots";
interface TemplateRow {
  id: string;
  container_id: string | null;
  title: string;
  description: string;
  category: string;
  snapshot_json: string;
  is_shipped: number;
  archived_at: string | null;
  deleted_at: string | null;
  revision_id: string;
}
async function template(ctx: FeatureContext, id: string, edit = false) {
  await currentSubject(ctx);
  const t = await ctx.db
    .prepare("SELECT * FROM knowledge_templates WHERE id=? AND workspace_id=?")
    .bind(id, ctx.actor.workspaceId)
    .first<TemplateRow>();
  if (!t || t.snapshot_json==='{}') throw new ApiProblem(404, "NOT_FOUND", "Not found.");
  if (t.container_id)
    await requireContainerLevel(ctx, t.container_id, edit ? "edit" : "view");
  if (edit && t.is_shipped)
    throw new ApiProblem(
      403,
      "SHIPPED_TEMPLATE",
      "Duplicate this shipped template to edit it.",
    );
  return t;
}
export async function listTemplates(
  ctx: FeatureContext,
  options: {
    containerId?: string;
    query?: string;
    category?: string;
    state?: "active" | "archived" | "deleted";
  } = {},
) {
  await currentSubject(ctx);
  if (options.containerId)
    await requireContainerLevel(ctx, options.containerId, "view");
  const result = await ctx.db
    .prepare(
      "SELECT id,CASE WHEN snapshot_json='{}' THEN 'Deleted template' ELSE title END AS title,description,category,container_id AS containerId,revision_id AS revisionId,is_shipped AS isShipped,deleted_at AS deletedAt,CASE WHEN snapshot_json='{}' THEN 1 ELSE 0 END AS erasurePending FROM knowledge_templates WHERE workspace_id=? AND (snapshot_json!='{}' OR EXISTS(SELECT 1 FROM core_job_failures j WHERE j.id='erasure:template:'||knowledge_templates.id AND j.state!='recovered')) AND ((?='active' AND deleted_at IS NULL AND archived_at IS NULL) OR (?='archived' AND deleted_at IS NULL AND archived_at IS NOT NULL) OR (?='deleted' AND deleted_at IS NOT NULL)) AND (container_id IS NULL OR container_id=?) AND (? IS NULL OR category=?) AND (lower(title) LIKE ? ESCAPE '\\' OR lower(description) LIKE ? ESCAPE '\\') ORDER BY container_id IS NULL,title,id",
    )
    .bind(
      ctx.actor.workspaceId,
      options.state ?? "active",
      options.state ?? "active",
      options.state ?? "active",
      options.containerId ?? null,
      options.category ?? null,
      options.category ?? null,
      ...Array(2).fill(
        "%" +
          (options.query ?? "").toLowerCase().replace(/[\\%_]/g, "\\$&") +
          "%",
      ),
    )
    .all<{id:string;title:string;description:string;category:string;containerId:string|null;revisionId:string;isShipped:number;deletedAt:string|null;erasurePending:number}>();
  const applyDestinations = await templateDestinations(ctx);
  const items = await Promise.all(result.results.map(async item=>({...item,permissions:await templatePermissions(ctx,{containerId:item.containerId,isShipped:!!item.isShipped,deleted:!!item.deletedAt},applyDestinations)})));
  return {
    items,
    applyDestinations,
    emptyMessage: result.results.length
      ? null
      : "No templates match this search.",
  };
}
export async function previewTemplate(ctx: FeatureContext, id: string) {
  const t = await template(ctx, id);
  if (t.deleted_at) throw new ApiProblem(404, "NOT_FOUND", "Not found.");
  const applyDestinations = await templateDestinations(ctx);
  return {
    permissions: await templatePermissions(ctx,{containerId:t.container_id,isShipped:!!t.is_shipped,deleted:!!t.deleted_at},applyDestinations),
    applyDestinations,
    id,
    title: t.title,
    description: t.description,
    category: t.category,
    revisionId: t.revision_id,
    archivedAt: t.archived_at,
    deletedAt: t.deleted_at,
    isShipped: !!t.is_shipped,
    // A template keeps the mention labels its author saw; each reader sees their own.
    snapshot: await labelForReader(ctx, previewSnapshot(
      id,
      await currentSnapshot(ctx, JSON.parse(t.snapshot_json) as TemplateSnapshot),
    )),
  };
}
export async function saveTemplate(
  ctx: FeatureContext,
  input: {
    operationKey: string;
    id?: string;
    expectedRevisionId?: string;
    sourcePageId: string;
    includeChildren: boolean;
    containerId: string | null;
    title: string;
    description: string;
    category: string;
  },
) {
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "templates.save",
    request: input,
    authorize: async () => {
      await currentSubject(ctx);
      if (input.id) await template(ctx, input.id, true);
      if (input.containerId)
        await requireContainerLevel(ctx, input.containerId, "edit");
      await snapshotPage(ctx, input.sourcePageId, input.includeChildren);
    },
    prepare: async ({ revisionId }) => {
      const id = input.id ?? createUlid(),
        snapshot = await snapshotPage(
          ctx,
          input.sourcePageId,
          input.includeChildren,
        );
      if (!input.title.trim())
        throw new ApiProblem(
          400,
          "INVALID_TEMPLATE",
          "Template title is required.",
        );
      return {
        entity: { id, kind: "template", revisionId },
        value: { id, revisionId },
        statements: [
          ...(input.id
            ? [
                mutationGuard(
                  ctx.db,
                  "SELECT revision_id=? AND is_shipped=0 FROM knowledge_templates WHERE id=?",
                  [input.expectedRevisionId ?? "", id],
                ),
              ]
            : []),
          ctx.db
            .prepare(
              "INSERT INTO knowledge_templates (id,workspace_id,container_id,title,description,category,snapshot_json,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET container_id=excluded.container_id,title=excluded.title,description=excluded.description,category=excluded.category,snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at,revision_id=excluded.revision_id",
            )
            .bind(
              id,
              ctx.actor.workspaceId,
              input.containerId,
              input.title,
              input.description,
              input.category,
              JSON.stringify(snapshot),
              ctx.now,
              ctx.now,
              revisionId,
            ),
          revision(ctx, revisionId, "template", id, { ...input, snapshot }),
        ],
      };
    },
  });
}
export async function changeTemplate(
  ctx: FeatureContext,
  id: string,
  input: {
    operationKey: string;
    expectedRevisionId: string;
    action: "archive" | "restore" | "delete" | "move" | "duplicate";
    containerId?: string | null;
  },
) {
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "templates." + input.action,
    request: { id, ...input },
    authorize: async () => {
      await template(ctx, id, input.action !== "duplicate");
      if (input.containerId)
        await requireContainerLevel(ctx, input.containerId, "edit");
    },
    prepare: async ({ revisionId }) => {
      const t = await template(ctx, id),
        nextId = input.action === "duplicate" ? createUlid() : id;
      const statements = [
        mutationGuard(
          ctx.db,
          "SELECT revision_id=? FROM knowledge_templates WHERE id=?",
          [input.expectedRevisionId, id],
        ),
      ];
      if (input.action === "duplicate")
        statements.push(
          ctx.db
            .prepare(
              "INSERT INTO knowledge_templates (id,workspace_id,container_id,title,description,category,snapshot_json,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              nextId,
              ctx.actor.workspaceId,
              input.containerId ?? t.container_id,
              t.title + " copy",
              t.description,
              t.category,
              t.snapshot_json,
              ctx.now,
              ctx.now,
              revisionId,
            ),
        );
      else
        statements.push(
          ctx.db
            .prepare(
              "UPDATE knowledge_templates SET container_id=?,archived_at=?,deleted_at=?,updated_at=?,revision_id=? WHERE id=?",
            )
            .bind(
              input.action === "move"
                ? (input.containerId ?? null)
                : t.container_id,
              input.action === "archive"
                ? ctx.now
                : input.action === "restore"
                  ? null
                  : t.archived_at,
              input.action === "delete"
                ? ctx.now
                : input.action === "restore"
                  ? null
                  : t.deleted_at,
              ctx.now,
              revisionId,
              id,
            ),
        );
      statements.push(
        revision(ctx, revisionId, "template", nextId, { ...t, ...input }),
      );
      return {
        entity: { id: nextId, kind: "template", revisionId },
        value: { id: nextId, revisionId },
        statements,
      };
    },
  });
}
export async function applyTemplate(
  ctx: FeatureContext,
  id: string,
  input: {
    operationKey: string;
    containerId: string;
    parentPageId?: string;
    expectedRevisionId: string;
  },
) {
  const staged: string[] = [];
  try {
    return await commitOperation(ctx, {
      operationKey: input.operationKey,
      action: "templates.apply",
      request: { id, ...input },
      authorize: async () => {
        await previewTemplate(ctx, id);
        await destination(ctx, input.containerId, input.parentPageId);
      },
      prepare: async ({ revisionId }) => {
        const row = await template(ctx, id);
        const t = {
          snapshot: await currentSnapshot(ctx, JSON.parse(row.snapshot_json) as TemplateSnapshot),
        };
        const plan = await prepareSnapshot(
          ctx,
          t.snapshot,
          input.containerId,
          input.parentPageId ?? null,
          input.operationKey,
          revisionId,
          0,
          staged,
        );
        return {
          entity: { id: plan.pageId, kind: "page", revisionId },
          value: { pageId: plan.pageId, pageIds: plan.pageIds, revisionId },
          statements: [
            mutationGuard(
              ctx.db,
              "SELECT revision_id=? AND deleted_at IS NULL AND archived_at IS NULL FROM knowledge_templates WHERE id=?",
              [input.expectedRevisionId, id],
            ),
            ...plan.statements,
          ],
        };
      },
    });
  } finally {
    for (const storageKey of staged) {
      if (
        !(await ctx.db
          .prepare("SELECT id FROM files WHERE storage_key=?")
          .bind(storageKey)
          .first())
      )
        await ctx.files.delete(storageKey);
    }
  }
}

export async function templateAsset(
  ctx: FeatureContext,
  id: string,
  fileId: string,
) {
  const t = await template(ctx, id);
  if (t.deleted_at) throw new ApiProblem(404, "NOT_FOUND", "Not found.");
  const asset = findAsset(JSON.parse(t.snapshot_json), fileId);
  if (!asset) throw new ApiProblem(404, "NOT_FOUND", "Not found.");
  const object = await ctx.files.get(asset.storageKey);
  if (!object) throw new ApiProblem(404, "NOT_FOUND", "File not found.");
  return new Response(object.body, {
    headers: {
      "content-type": asset.contentType,
      "content-disposition": `${/^(image|audio|video)\//.test(asset.contentType) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
}
