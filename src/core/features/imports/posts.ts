import type {PostMetadata} from '../posts/types';
import type {ImportedPage} from './types';

/** IDs have already been assigned by prepareImportPrincipals, including unmapped authors. */
export function importedPostMetadata(page:ImportedPage,idFor:(kind:string,id:string)=>string):PostMetadata|undefined {
 if(!page.post)return;
 const post=page.post;
 return {
  origin:'import',
  publishedAt:post.publishedAt??null,
  authorMemberId:post.authorSourceId?idFor('member',post.authorSourceId):null,
  ...(!post.authorSourceId&&post.authorDisplayName?{historicalAuthor:{displayName:post.authorDisplayName}}:{}),
 };
}
