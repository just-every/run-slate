import type { FeatureContext } from "../../app/feature-context";
import type { PageProperties } from "../pages/types";
import { recordValues } from "./evaluation";
/** Current-reader filtering applies to every duplicate revision property map. */
export async function filterRecordProperties<T extends Partial<PageProperties>>(ctx: FeatureContext, pageId: string, properties: T): Promise<T> {
  if (!properties.databaseFields) return properties;
  const record = await ctx.db.prepare("SELECT database_id FROM database_records WHERE page_id=?").bind(pageId).first<{database_id:string}>();
  if (!record) {
    const retained = await ctx.db.prepare("SELECT fields_json FROM structured_page_fields WHERE page_id=?").bind(pageId).first<{fields_json:string}>();
    if (!retained) return { ...properties, databaseFields: {} };
    return {...properties,databaseFields:await recordValues(ctx,pageId,properties.databaseFields,JSON.parse(retained.fields_json))};
  }
  return { ...properties, databaseFields: await recordValues(ctx, record.database_id, properties.databaseFields) };
}
