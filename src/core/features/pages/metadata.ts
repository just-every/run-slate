import type {PageProperties} from './types';
import {postMetadataSchema} from '../posts/types';
import {ApiProblem} from '../../app/problems';

export function validatePageMetadata(properties:Partial<PageProperties>) {
 if(properties.post!==undefined&&!postMetadataSchema.safeParse(properties.post).success)throw new ApiProblem(400,'INVALID_POST_METADATA','The post metadata is invalid.');
 if(properties.reviewDate!==undefined&&properties.reviewDate!==null){
  const value=properties.reviewDate;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new ApiProblem(400,'INVALID_REVIEW_DATE','Choose a valid review date.');
 }
}
export function validateNativePost(properties:Partial<PageProperties>|undefined,memberId:string){
 if(!properties?.post)return;
 const post=properties.post;
 if(post.origin!=='native'||post.authorMemberId!==memberId||post.publishedAt!==null||post.historicalAuthor)throw new ApiProblem(400,'POST_METADATA_SERVER_OWNED','Post authors and publication dates are assigned by the server.');
}

/** A content restore does not republish a post under a different date or author. */
export function retainPostIdentity(current:PageProperties,restored:PageProperties):PageProperties {
 return current.post?{...restored,post:current.post}:restored;
}
