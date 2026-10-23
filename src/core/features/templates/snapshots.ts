import {materializeSynced} from '../editor/synced/read';
import { recordValues } from "../databases/evaluation";
import type { Field } from "../databases/values";
import { fields } from "../databases/repository";
import {
  retainAssets,
  mappedAssetId,
  materializeAssets,
  mapAssetBlocks,
  type TemplateAsset,
} from "./assets";
import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { readPage, prepareCreatePage } from "../pages/service";
import type { BlockInput, PageProperties } from "../pages/types";
import { createUlid } from "../../shared/ulid";
export interface TemplateSnapshot {
  title: string;
  properties: Pick<
    PageProperties,
    | "icon"
    | "coverFileId"
    | "cover"
    | "databaseFields"
    | "labels"
    | "typeface"
    | "smallText"
    | "fullWidth"
  >;
  blocks: BlockInput[];
  children: TemplateSnapshot[];
  assets?: TemplateAsset[];
  databaseId?: string;
  fieldDefinitions?: Field[];
  fileFieldIds?: string[];
  relationFieldIds?: string[];
}
export async function snapshotPage(
  ctx: FeatureContext,
  id: string,
  children: boolean,
  seen = new Set<string>(),
): Promise<TemplateSnapshot> {
  if (seen.has(id) || seen.size > 100)
    throw new ApiProblem(
      400,
      "TEMPLATE_LIMIT",
      "Template tree exceeds allowed depth.",
    );
  const p = await readPage(ctx, id);p.blocks=materializeSynced(p.blocks,p.page.title);
  const snapshot: TemplateSnapshot = {
    title: p.page.title,
    properties: {
      icon: p.properties.icon,
      coverFileId: p.properties.coverFileId,
      ...(p.properties.cover !== undefined ? {cover:structuredClone(p.properties.cover)} : {}),
      ...(p.properties.databaseFields
        ? { databaseFields: structuredClone(p.properties.databaseFields) }
        : {}),
      labels: p.properties.labels,
      typeface: p.properties.typeface,
      smallText: p.properties.smallText,
      fullWidth: p.properties.fullWidth,
    },
    blocks: p.blocks.map((b) => ({
      id: b.id,
      blockType: b.blockType,
      content: b.content,
      parentBlockId: b.parentBlockId,
      treePosition: b.treePosition,
    })),
    children: [],
  };
  const record = await ctx.db.prepare("SELECT database_id FROM database_records WHERE page_id=?").bind(id).first<{database_id:string}>();
  const copiedDefinitions = !record ? await ctx.db.prepare("SELECT fields_json FROM structured_page_fields WHERE page_id=?").bind(id).first<{fields_json:string}>() : null;
  const definitions: Field[] = record ? await fields(ctx,record.database_id) : copiedDefinitions ? JSON.parse(copiedDefinitions.fields_json) : [];
  snapshot.databaseId = record?.database_id ?? (copiedDefinitions ? id : undefined);
  snapshot.fieldDefinitions = definitions;
  snapshot.fileFieldIds = definitions.filter(f=>f.type==="file").map(f=>f.id);
  snapshot.relationFieldIds = definitions.filter(f=>f.type==="relation").map(f=>f.id);
  const propertyFiles = snapshot.fileFieldIds.flatMap(id=> {
    const value = snapshot.properties.databaseFields?.[id];
    return Array.isArray(value) ? value.filter((v):v is string=>typeof v==="string") : [];
  });
  if (snapshot.properties.icon?.startsWith("file:")) propertyFiles.push(snapshot.properties.icon.slice(5));
  snapshot.assets = await retainAssets(
    ctx,
    snapshot.blocks,
    snapshot.properties.coverFileId,
    propertyFiles,
  );
  if (children) {
    const rows = await ctx.db
      .prepare(
        "SELECT id FROM pages WHERE parent_page_id=? AND deleted_at IS NULL AND trashed_at IS NULL AND archived_at IS NULL ORDER BY tree_position,id",
      )
      .bind(id)
      .all<{
        id: string;
      }>();
    for (const row of rows.results)
      snapshot.children.push(
        await snapshotPage(ctx, row.id, true, new Set(seen).add(id)),
      );
  }
  return snapshot;
}
export async function prepareSnapshot(
  ctx: FeatureContext,
  snapshot: TemplateSnapshot,
  containerId: string,
  parentPageId: string | null,
  operationKey: string,
  revisionId: string,
  depth = 0,
  staged: string[] = [],
): Promise<{
  pageId: string;
  statements: D1PreparedStatement[];
  pageIds: string[];
}> {
  if (depth > 64)
    throw new ApiProblem(
      400,
      "TEMPLATE_LIMIT",
      "Template tree exceeds allowed depth.",
    );
  const pageId = createUlid();
  const media = await materializeAssets(
    ctx,
    snapshot.assets ?? [],
    pageId,
    operationKey,
    staged,
  );
  const ids = new Map(snapshot.blocks.map((b) => [b.id, createUlid()]));
  const p = await prepareCreatePage(
    ctx,
    {
      operationKey,
      id: pageId,
      containerId,
      parentPageId,
      title: snapshot.title,
      properties: {
        ...snapshot.properties,
        icon: snapshot.properties.icon?.startsWith("file:")
          ? `file:${mappedAssetId(media.mapping,snapshot.properties.icon.slice(5))}` : snapshot.properties.icon ?? null,
        ...(snapshot.properties.databaseFields ? {databaseFields: Object.fromEntries(Object.entries(snapshot.properties.databaseFields).map(([key,value])=>[key,
          snapshot.fileFieldIds?.includes(key) && Array.isArray(value) ? value.map(id=>typeof id === "string" ? mappedAssetId(media.mapping,id) : id) : value
        ]))} : {}),
        coverFileId: snapshot.properties.coverFileId
          ? mappedAssetId(media.mapping,snapshot.properties.coverFileId)
          : null,
      },
      blocks: mapAssetBlocks(snapshot.blocks, media.mapping).map((b) => ({
        ...b,
        id: ids.get(b.id)!,
        parentBlockId: b.parentBlockId
          ? (ids.get(b.parentBlockId) ?? null)
          : null,
      })),
    },
    revisionId,
  );
  const statements = [...p.statements, ...media.statements,
    ...(snapshot.fieldDefinitions?.length ? [ctx.db.prepare("INSERT INTO structured_page_fields(page_id,fields_json) VALUES (?,?)").bind(pageId,JSON.stringify(snapshot.fieldDefinitions))] : [])],
    pageIds = [p.value.pageId];
  for (const child of snapshot.children) {
    const result = await prepareSnapshot(
      ctx,
      child,
      containerId,
      p.value.pageId,
      operationKey,
      createUlid(),
      depth + 1,
      staged,
    );
    statements.push(...result.statements);
    pageIds.push(...result.pageIds);
  }
  return { pageId: p.value.pageId, pageIds, statements };
}

/** Retained files belong to the template; related records still require current access. */
export async function currentSnapshot(ctx: FeatureContext, snapshot: TemplateSnapshot): Promise<TemplateSnapshot> {
  const copy = structuredClone(snapshot);
  if (copy.properties.databaseFields && Object.keys(copy.properties.databaseFields).length && !copy.fieldDefinitions)
    throw new ApiProblem(409,"TEMPLATE_SCHEMA_MISSING","This older template lacks property definitions; save its source again before using its structured properties.");
  if (copy.databaseId && copy.fieldDefinitions && copy.properties.databaseFields) {
    copy.properties.databaseFields = await recordValues(ctx,copy.databaseId,copy.properties.databaseFields,
      copy.fieldDefinitions.map(f=>f.type === "file" ? {...f,type:"multi-select" as const} : f)) as PageProperties["databaseFields"];
  }
  copy.children = await Promise.all(copy.children.map(child=>currentSnapshot(ctx,child)));
  return copy;
}
