import type { FeatureContext } from "../../app/feature-context";
import type { BlockInput } from "../pages/types";
import { serveMedia, prepareImportedMedia } from "../media/service";
import { ApiProblem } from "../../app/problems";
export interface TemplateAsset {
  fileId: string;
  storageKey: string;
  name: string;
  contentType: string;
}
export async function retainAssets(
  ctx: FeatureContext,
  blocks: BlockInput[],
  coverFileId: string | null,
  propertyFileIds: string[] = [],
): Promise<TemplateAsset[]> {
  const ids = new Set<string>([...(coverFileId ? [coverFileId] : []), ...propertyFileIds]);
  for (const b of blocks) {
    if (
      b.blockType === "media" &&
      b.content &&
      typeof b.content === "object" &&
      !Array.isArray(b.content)
    ) {
      const source = b.content.source;
      if (
        source &&
        typeof source === "object" &&
        !Array.isArray(source) &&
        typeof source.fileId === "string"
      )
        ids.add(source.fileId);
    }
  }
  const assets: TemplateAsset[] = [];
  for (const id of ids) {
    const response = await serveMedia(ctx, id);
    const metadata = await ctx.db
      .prepare("SELECT original_name,content_type FROM files WHERE id=?")
      .bind(id)
      .first<{ original_name: string; content_type: string }>();
    if (!metadata) throw new ApiProblem(404, "NOT_FOUND", "File not found.");
    const bytes = await response.arrayBuffer();
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const storageKey = `template-assets/${ctx.actor.workspaceId}/${digest}`;
    await ctx.files.put(storageKey, bytes, {
      httpMetadata: { contentType: metadata.content_type },
    });
    assets.push({
      fileId: id,
      storageKey,
      name: metadata.original_name,
      contentType: metadata.content_type,
    });
  }
  return assets;
}
export async function materializeAssets(
  ctx: FeatureContext,
  assets: TemplateAsset[],
  pageId: string,
  operationKey: string,
  staged: string[] = [],
) {
  const mapping = new Map<string, { id: string; url: string }>(),
    statements: D1PreparedStatement[] = [];
  for (const asset of assets) {
    const object = await ctx.files.get(asset.storageKey);
    if (!object)
      throw new ApiProblem(
        409,
        "TEMPLATE_ASSET_MISSING",
        "A retained template attachment is missing.",
      );
    const copy = await prepareImportedMedia(ctx, {
      operationKey,
      pageId,
      name: asset.name,
      contentType: asset.contentType,
      bytes: new Uint8Array(await object.arrayBuffer()),
    });
    staged.push(copy.storageKey);
    mapping.set(asset.fileId, { id: copy.id, url: copy.value.url });
    statements.push(...copy.statements);
  }
  return { mapping, statements };
}
export function mapAssetBlocks(
  blocks: BlockInput[],
  mapping: Map<string, { id: string; url: string }>,
) {
  return blocks.map((block) => {
    const copy = structuredClone(block);
    if (
      copy.blockType === "media" &&
      copy.content &&
      typeof copy.content === "object" &&
      !Array.isArray(copy.content)
    ) {
      const source = copy.content.source;
      if (
        source &&
        typeof source === "object" &&
        !Array.isArray(source) &&
        typeof source.fileId === "string"
      ) {
        const asset = mapping.get(source.fileId);
        if (!asset) throw new ApiProblem(409,"TEMPLATE_ASSET_MISSING","The template attachment was not retained.");
        {
          source.fileId = asset.id;
          source.url = asset.url;
        }
      }
    }
    return copy;
  });
}
export function previewSnapshot(
  templateId: string,
  snapshot: import("./snapshots").TemplateSnapshot,
): import("./snapshots").TemplateSnapshot & { coverUrl?: string } {
  const mapping = new Map(
    (snapshot.assets ?? []).map((asset) => [
      asset.fileId,
      {
        id: asset.fileId,
        url: `/api/templates/${templateId}/assets/${asset.fileId}`,
      },
    ]),
  );
  return {
    ...snapshot,
    assets: undefined,
    blocks: mapAssetBlocks(snapshot.blocks, mapping),
    children: snapshot.children.map((child) =>
      previewSnapshot(templateId, child),
    ),
    ...(snapshot.properties.coverFileId &&
    mapping.has(snapshot.properties.coverFileId)
      ? { coverUrl: mapping.get(snapshot.properties.coverFileId)!.url }
      : {}),
  };
}
export function findAsset(
  snapshot: import("./snapshots").TemplateSnapshot,
  fileId: string,
): TemplateAsset | undefined {
  return (
    snapshot.assets?.find((a) => a.fileId === fileId) ??
    snapshot.children.map((child) => findAsset(child, fileId)).find(Boolean)
  );
}

export function mappedAssetId(mapping: Map<string,{id:string;url:string}>, source: string): string {
  const asset = mapping.get(source);
  if (!asset) throw new ApiProblem(409,"TEMPLATE_ASSET_MISSING","The template attachment was not retained; save the source template again.");
  return asset.id;
}
