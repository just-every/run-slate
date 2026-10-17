import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {readPage} from '../pages/service';
import {bodyReferencesFile,propertyReferencesFile} from '../media/references';

/** Use the native file door, which rechecks source-page authority on every fetch. */
export async function postCoverUrl(ctx:FeatureContext,fileId:string|null):Promise<string|null> {
 if(!fileId)return null;
 const file=await ctx.db.prepare('SELECT page_id,content_type FROM files WHERE id=? AND workspace_id=? AND deleted_at IS NULL')
  .bind(fileId,ctx.actor.workspaceId).first<{page_id:string;content_type:string}>();
 if(!file?.page_id||!file.content_type.startsWith('image/'))return null;
 try {
  const document=await readPage(ctx,file.page_id);
  if(!document.permissions.canEdit&&document.properties.coverFileId!==fileId&&document.properties.icon!==`file:${fileId}`&&!bodyReferencesFile(document.blocks,fileId)&&!await propertyReferencesFile(ctx,file.page_id,document.properties,fileId))return null;
  return `/api/media/${encodeURIComponent(fileId)}?display=cover`;
 } catch(error) {
  if(error instanceof ApiProblem&&error.status===404)return null;
  throw error;
 }
}
