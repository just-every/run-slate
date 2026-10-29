import type { FeatureContext } from "../../app/feature-context";
import { requirePageLevel } from "../sharing/current-access";
export async function publishingExposure(ctx:FeatureContext,id:string) {
await requirePageLevel(ctx,id,'full');const exposure=await ctx.db.prepare('SELECT host,slug,indexable,theme,header_controls_json AS headerControls,duplicate_as_template AS duplicateAsTemplate,social_preview_json AS socialPreview,published_at AS publishedAt,revoked_at AS revokedAt FROM public_exposures WHERE page_id=?').bind(id).first<{host:string;slug:string;indexable:number;theme:string;headerControls:string;duplicateAsTemplate:number;socialPreview:string;publishedAt:string;revokedAt:string|null}>();return {exposure:exposure?{...exposure,indexable:!!exposure.indexable,duplicateAsTemplate:!!exposure.duplicateAsTemplate,headerControls:JSON.parse(exposure.headerControls),socialPreview:JSON.parse(exposure.socialPreview)}:null};
}
