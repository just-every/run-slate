import { serveMedia } from '../media/service';
import { z } from 'zod';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import type { PageProperties } from './types';

export const coverGalleryIds = ['sand', 'ocean', 'forest', 'sunset', 'lavender', 'slate'] as const;
export const coverSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('gallery'),id:z.enum(coverGalleryIds)}).strict(),
  z.object({kind:z.literal('link'),url:z.string().url().max(2048).refine(value=>{
    try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password; } catch { return false; }
  },'A cover link must be an HTTPS URL without credentials.')}).strict(),
]);
export type PageCover = z.infer<typeof coverSchema>;
export function validateAppearance(properties:Partial<PageProperties>) {
  if(properties.icon!==undefined&&properties.icon!==null&&(typeof properties.icon!=='string'||properties.icon.length>1000))throw new ApiProblem(400,'INVALID_ICON','Choose an emoji, supplied icon or uploaded image.');
  if(properties.cover!==undefined&&properties.cover!==null&&!coverSchema.safeParse(properties.cover).success)throw new ApiProblem(400,'INVALID_COVER','Choose a gallery cover or an HTTPS link.');
  if(properties.cover&&properties.coverFileId)throw new ApiProblem(400,'INVALID_COVER','Choose one cover source.');
}
/** Descriptors are data only: saving a URL never fetches it or sends a reader to it. */
export async function validateUploadedAppearance(ctx:FeatureContext,pageId:string,properties:Partial<PageProperties>) {
  for(const [kind,id] of [['icon',properties.icon?.startsWith('file:')?properties.icon.slice(5):null],['cover',properties.coverFileId]] as const) {
    if(!id)continue;
    const file=await ctx.db.prepare('SELECT page_id FROM files WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(id,ctx.actor.workspaceId).first<{page_id:string}>();
    if(!file)throw new ApiProblem(400,kind==='icon'?'INVALID_ICON':'INVALID_COVER','Choose an available uploaded file.');
    // Existing references may be shared across authored pages. Reuse requires current access
    // to the source file; target access never becomes authority over its source.
    if(file.page_id!==pageId)await serveMedia(ctx,id);
    // Display dispatch remains type-aware: non-media references are retained/downloaded,
    // never promoted to inline image responses by an icon or cover property.
  }
}
export function mergeAppearance(before:PageProperties,patch:Partial<PageProperties>):PageProperties {
  const next={...before,...patch};
  if(patch.cover!==undefined&&patch.cover!==null)next.coverFileId=null;
  if(patch.coverFileId!==undefined&&patch.coverFileId!==null)next.cover=null;
  return next;
}
